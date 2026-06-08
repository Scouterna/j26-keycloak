import type { ClassKey } from "keycloakify/login";
import DefaultPage from "keycloakify/login/DefaultPage";
import { lazy, Suspense } from "react";
import { useI18n } from "./i18n";
import type { KcContext } from "./KcContext";
import Template from "./Template";

import "./style.css";

import "@scouterna/ui-webc/style.css";
import "@fontsource-variable/source-sans-3/index.css";

const doMakeUserConfirmPassword = true;

const UserProfileFormFields = lazy(
	() => import("keycloakify/login/UserProfileFormFields"),
);
const Login = lazy(() => import("./pages/Login"));

export default function KcPage(props: { kcContext: KcContext }) {
	const { kcContext } = props;

	const { i18n } = useI18n({ kcContext });

	return (
		<Suspense>
			{(() => {
				switch (kcContext.pageId) {
					case "login.ftl":
						return (
							<Login
								{...{ kcContext, i18n, classes }}
								Template={Template}
								doUseDefaultCss={false}
							/>
						);
					default:
						return (
							<DefaultPage
								kcContext={kcContext}
								i18n={i18n}
								classes={classes}
								Template={Template}
								doUseDefaultCss={false}
								UserProfileFormFields={UserProfileFormFields}
								doMakeUserConfirmPassword={doMakeUserConfirmPassword}
							/>
						);
				}
			})()}
		</Suspense>
	);
}

const classes = {} satisfies { [key in ClassKey]?: string };
