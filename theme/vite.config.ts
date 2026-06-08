import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { keycloakify } from "keycloakify/vite-plugin";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		keycloakify({
			themeName: ["scoutid"],
			accountThemeImplementation: "none",
			groupId: "se.scouterna.keycloak",
			artifactId: "scoutid-keycloak-theme",
		}),
		tailwindcss(),
	],
});
