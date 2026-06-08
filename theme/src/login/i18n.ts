/* eslint-disable @typescript-eslint/no-unused-vars */
import { i18nBuilder } from "keycloakify/login";
import type { ThemeName } from "../kc.gen";

/**
 * IMPORTANT: Translation duplication required for Keycloakify v11
 *
 * This file defines translations for Storybook development environment.
 * The same translations MUST also be maintained in messages_*.properties files
 * for the actual Keycloak deployment.
 *
 * When adding/modifying translations:
 * 1. Update this file for Storybook to work
 * 2. Update messages_en.properties and messages_sv.properties for deployment
 *
 * @see: https://docs.keycloakify.dev/features/i18n
 */
const { useI18n, ofTypeI18n } = i18nBuilder
	.withThemeName<ThemeName>()
	.withCustomTranslations({
		en: {
			// Override default Keycloak field labels
			loginAccountTitle: "Sign in",
			usernameOrEmail: "Username",
			username: "Username",
			// Additional UI texts
			usernameHelpText:
				"Membership number, personal identity number, or primary email address",
			// Login page
			"scoutid.login.subheadline":
				"Sign in with your Scoutnet credentials to continue.",
			// Help section
			"scoutid.help.title": "Don't have a login?",
			"scoutid.help.body":
				"You need a Scoutnet account, which you automatically have if you are a member of a scout troop directly connected to Scouterna, NSF, or Salt Scout.",
			"scoutid.help.equmenia.before":
				"If you are a member of Equmenia, contact",
			"scoutid.help.equmenia.after": "for help getting a Scoutnet account.",
		},
		sv: {
			// Override default Keycloak field labels
			loginAccountTitle: "Logga in",
			usernameOrEmail: "Användarnamn",
			username: "Användarnamn",
			// Additional UI texts
			usernameHelpText: "Medlemsnummer, personnummer eller primär epostadress",
			// Login page
			"scoutid.login.subheadline":
				"Logga in med dina Scoutnet uppgifter för att fortsätta.",
			// Help section
			"scoutid.help.title": "Har du en inloggning?",
			"scoutid.help.body":
				"För att logga in på den här e-tjänsten behöver du ett Scoutnet konto, som du har automatiskt om du är direktansluten till Scouterna, Nykterhetsrörelsens Scoutförbund eller Salt Scout.",
			"scoutid.help.equmenia.before": "Om du är medlem i Equmenia, kontakta",
			"scoutid.help.equmenia.after":
				"för att få hjälp med att skaffa ett Scoutnet konto.",
		},
	})
	.build();

type I18n = typeof ofTypeI18n;

export { useI18n, type I18n };
