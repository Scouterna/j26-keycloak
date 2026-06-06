package se.scouterna.keycloak.client;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jboss.logging.Logger;
import se.scouterna.keycloak.client.dto.AuthResult;
import se.scouterna.keycloak.client.dto.AuthResponse;
import se.scouterna.keycloak.client.dto.ErrorResponse;
import se.scouterna.keycloak.client.dto.Profile;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Minimal Scoutnet API client for the J26 auth-only provider.
 * Only two endpoints are used: POST /api/authenticate and GET /api/get/profile.
 */
public class ScoutnetClient {

    private static final Logger log = Logger.getLogger(ScoutnetClient.class);
    private static final String SCOUTNET_BASE_URL = System.getenv().getOrDefault("SCOUTNET_BASE_URL", "https://scoutnet.se");
    private static final String AUTH_URL = SCOUTNET_BASE_URL + "/api/authenticate";
    private static final String PROFILE_URL = SCOUTNET_BASE_URL + "/api/get/profile";

    // Shared HttpClient (HTTP/2 with multiplexing)
    private static final HttpClient SHARED_HTTP_CLIENT = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .executor(java.util.concurrent.ForkJoinPool.commonPool())
        .version(HttpClient.Version.HTTP_2)
        .build();

    private static final ObjectMapper SHARED_OBJECT_MAPPER = new ObjectMapper()
        .configure(DeserializationFeature.ACCEPT_EMPTY_ARRAY_AS_NULL_OBJECT, true);

    public ScoutnetClient() {
        // No instance variables needed - everything is static
    }

    private String getErrorType(int statusCode) {
        return switch (statusCode) {
            case 400 -> "Bad Request";
            case 401 -> "Unauthorized";
            case 403 -> "Forbidden";
            case 404 -> "Not Found";
            case 429 -> "Rate Limited";
            case 500 -> "Internal Server Error";
            case 502 -> "Bad Gateway";
            case 503 -> "Service Unavailable";
            case 504 -> "Gateway Timeout";
            default -> "HTTP " + statusCode;
        };
    }

    private String tryParseErrorResponse(String responseBody) {
        if (responseBody == null || responseBody.trim().isEmpty()) {
            return "No error details";
        }

        try {
            ErrorResponse errorResponse = SHARED_OBJECT_MAPPER.readValue(responseBody, ErrorResponse.class);
            return errorResponse.getSafeErrorMessage();
        } catch (Exception e) {
            // If we can't parse as ErrorResponse, return a safe truncated version
            return responseBody.length() > 50 ? responseBody.substring(0, 50) + "..." : responseBody;
        }
    }

    public AuthResult authenticate(String username, String password, String logUsername, String correlationId) {
        try {
            Map<String, String> payload = new HashMap<>();
            payload.put("username", username);
            payload.put("password", password);

            String jsonPayload = SHARED_OBJECT_MAPPER.writeValueAsString(payload);

            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(AUTH_URL))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

            HttpResponse<String> response = SHARED_HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                AuthResponse authResponse = SHARED_OBJECT_MAPPER.readValue(response.body(), AuthResponse.class);
                return AuthResult.success(authResponse);
            } else {
                String errorType = getErrorType(response.statusCode());
                String errorDetail = tryParseErrorResponse(response.body());
                log.debugf("[%s] Scoutnet authentication failed for user %s. Status: %d, Error: %s, Detail: %s",
                    correlationId, logUsername, response.statusCode(), errorType, errorDetail);

                AuthResult.AuthError authError = switch (response.statusCode()) {
                    case 401, 403 -> AuthResult.AuthError.INVALID_CREDENTIALS;
                    default -> AuthResult.AuthError.SERVICE_UNAVAILABLE;
                };
                return AuthResult.failure(authError);
            }
        } catch (java.net.http.HttpTimeoutException e) {
            log.errorf("[%s] Scoutnet API timeout during authentication for user %s: %s", correlationId, logUsername, e.getMessage());
            return AuthResult.failure(AuthResult.AuthError.SERVICE_UNAVAILABLE);
        } catch (java.net.ConnectException e) {
            log.errorf("[%s] Cannot connect to Scoutnet API for user %s: %s", correlationId, logUsername, e.getMessage());
            return AuthResult.failure(AuthResult.AuthError.SERVICE_UNAVAILABLE);
        } catch (Exception e) {
            log.errorf("[%s] Unexpected error during Scoutnet authentication for user %s: %s", correlationId, logUsername, e.getClass().getSimpleName());
            return AuthResult.failure(AuthResult.AuthError.SERVICE_UNAVAILABLE);
        }
    }

    /**
     * Fetches the user profile using the authentication token.
     *
     * @param token The bearer token from a successful authentication.
     * @return A Profile object, or null if the request fails.
     */
    public Profile getProfile(String token, String correlationId) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(PROFILE_URL))
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();

            HttpResponse<String> response = SHARED_HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                String errorType = getErrorType(response.statusCode());
                String errorDetail = tryParseErrorResponse(response.body());
                log.warnf("[%s] Scoutnet profile fetch failed. Status: %d, Error: %s, Detail: %s",
                    correlationId, response.statusCode(), errorType, errorDetail);
                return null;
            }

            return SHARED_OBJECT_MAPPER.readValue(response.body(), Profile.class);
        } catch (java.net.http.HttpTimeoutException e) {
            log.errorf("[%s] Scoutnet API timeout during profile fetch: %s", correlationId, e.getMessage());
            return null;
        } catch (java.net.ConnectException e) {
            log.errorf("[%s] Cannot connect to Scoutnet API for profile fetch: %s", correlationId, e.getMessage());
            return null;
        } catch (Exception e) {
            log.errorf("[%s] Unexpected error during Scoutnet profile fetch: %s", correlationId, e.getClass().getSimpleName());
            return null;
        }
    }
}
