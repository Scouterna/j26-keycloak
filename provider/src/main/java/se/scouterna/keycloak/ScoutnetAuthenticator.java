package se.scouterna.keycloak;

import jakarta.ws.rs.core.MultivaluedMap;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.KeycloakModelUtils;
import se.scouterna.keycloak.client.ScoutnetClient;
import se.scouterna.keycloak.client.dto.AuthResult;
import se.scouterna.keycloak.client.dto.AuthResponse;
import se.scouterna.keycloak.client.dto.Profile;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Minimal (auth-only) Keycloak Authenticator that validates credentials against the
 * Scoutnet API and populates only the standard user fields plus scoutnet_member_no.
 *
 * No remember-me / persistent tokens, no roles, no groups, no memberships claim.
 * A short-lived Scoutnet token is requested and used once to fetch the profile.
 */
public class ScoutnetAuthenticator implements Authenticator {

    private static final Logger log = Logger.getLogger(ScoutnetAuthenticator.class);

    private final ScoutnetClient scoutnetClient;

    public ScoutnetAuthenticator() {
        this.scoutnetClient = new ScoutnetClient();
    }

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        log.debug("Displaying login form for Scoutnet authentication.");
        context.challenge(context.form().createLoginUsernamePassword());
    }

    @Override
    public void action(AuthenticationFlowContext context) {
        String correlationId = UUID.randomUUID().toString().substring(0, 8);
        log.debugf("[%s] Processing submitted login form for Scoutnet authentication.", correlationId);
        MultivaluedMap<String, String> formData = context.getHttpRequest().getDecodedFormParameters();
        String username = formData.getFirst("username");
        String password = formData.getFirst("password");

        if (username == null || username.trim().isEmpty() || password == null || password.isEmpty()) {
            failAuthentication(context, username, "Please provide both a username and a password.", correlationId);
            return;
        }

        boolean isPersonnummer = !username.contains("@") && !(username.matches("\\d{7}") && !username.matches("\\d{10,12}"));
        if (isPersonnummer) {
            username = normalizePersonnummer(username);
        }

        String logUsername = safeLogUsername(username, isPersonnummer);

        // Step 1: Authenticate against Scoutnet (short-lived token, no app_id).
        AuthResult authResult = scoutnetClient.authenticate(username, password, logUsername, correlationId);
        if (!authResult.isSuccess()) {
            String messageKey = authResult.getError() == AuthResult.AuthError.INVALID_CREDENTIALS
                ? "invalidUserMessage"
                : "loginTimeout";
            failAuthentication(context, logUsername, messageKey, correlationId);
            return;
        }

        AuthResponse authResponse = authResult.getAuthResponse();
        if (authResponse.getToken() == null || authResponse.getToken().isEmpty()) {
            failAuthentication(context, logUsername, "loginTimeout", correlationId);
            return;
        }

        // Step 2: Fetch the profile.
        Profile profile = scoutnetClient.getProfile(authResponse.getToken(), correlationId);
        if (profile == null) {
            log.errorf("[%s] Could not retrieve user profile from Scoutnet for user: %s", correlationId, logUsername);
            failAuthentication(context, logUsername, "loginTimeout", correlationId);
            return;
        }

        // Step 3: Find or create the Keycloak user.
        String keycloakUsername = "scoutnet|" + profile.getMemberNo();
        UserModel user = KeycloakModelUtils.findUserByNameOrEmail(context.getSession(), context.getRealm(), keycloakUsername);

        if (user == null) {
            log.infof("[%s] First time login for Scoutnet user: %d. Creating new Keycloak user: %s.", correlationId, profile.getMemberNo(), keycloakUsername);
            user = context.getSession().users().addUser(context.getRealm(), keycloakUsername);
            user.setEnabled(true);
        } else {
            log.debugf("[%s] Found existing Keycloak user: %s, refreshing profile.", correlationId, keycloakUsername);
        }

        // Step 4: Sync the minimal set of attributes.
        user.setFirstName(profile.getFirstName());
        user.setLastName(profile.getLastName());
        user.setEmail(profile.getEmail());
        user.setEmailVerified(true);
        user.setSingleAttribute("scoutnet_member_no", String.valueOf(profile.getMemberNo()));
        if (profile.getDob() != null && !profile.getDob().isBlank()) {
            user.setSingleAttribute("birthdate", profile.getDob());
        }
        if (profile.getLanguage() != null && !profile.getLanguage().isBlank()) {
            user.setSingleAttribute("locale", profile.getLanguage());
        }

        context.setUser(user);
        context.getAuthenticationSession().removeAuthNote("username");
        log.infof("[%s] Authentication successful for user: %s", correlationId, keycloakUsername);
        context.success();
    }

    private void failAuthentication(AuthenticationFlowContext context, String logUsername, String messageKey, String correlationId) {
        log.warnf("[%s] Authentication failed for user %s: %s", correlationId, logUsername, messageKey);
        context.getEvent().user(logUsername).error("invalid_grant");
        context.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS,
            context.form().setError(messageKey).createLoginUsernamePassword());
    }

    private String safeLogUsername(String username, boolean isPersonnummer) {
        if (isPersonnummer && username.length() >= 8) {
            return username.substring(0, 8) + "****";
        }
        return username;
    }

    private String normalizePersonnummer(String input) {
        String digits = input.replaceAll("-", "");

        if (digits.matches("\\d{10}")) {
            int year = Integer.parseInt(digits.substring(0, 2));
            int currentYear = LocalDate.now().getYear();
            int currentCentury = currentYear / 100;
            int currentYearInCentury = currentYear % 100;

            String century = (year > currentYearInCentury || (currentYear - (currentCentury * 100 + year)) >= 100)
                ? String.valueOf(currentCentury - 1)
                : String.valueOf(currentCentury);

            return century + digits;
        } else if (digits.matches("\\d{12}")) {
            return digits;
        }

        return input;
    }

    @Override
    public boolean requiresUser() { return false; }
    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) { return true; }
    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {}
    @Override
    public void close() {}
}
