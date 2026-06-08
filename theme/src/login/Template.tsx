import { ScoutCallout } from "@scouterna/ui-react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { useInitialize } from "keycloakify/login/Template.useInitialize";
import type { TemplateProps } from "keycloakify/login/TemplateProps";
import { useSetClassName } from "keycloakify/tools/useSetClassName";
import { useEffect } from "react";
import j26Logo from "./assets/j26-logo.png";
import background from "./assets/waves.svg";
import type { I18n } from "./i18n";
import type { KcContext } from "./KcContext";

export default function Template(props: TemplateProps<KcContext, I18n>) {
	const {
		displayInfo = false,
		displayMessage = true,
		headerNode,
		socialProvidersNode = null,
		infoNode = null,
		documentTitle,
		bodyClassName,
		kcContext,
		i18n,
		doUseDefaultCss,
		children,
	} = props;

	const { msg, msgStr } = i18n;

	const { realm, auth, url, message, isAppInitiatedAction } = kcContext;

	useEffect(() => {
		document.title = documentTitle ?? msgStr("loginTitle", realm.displayName);
	}, [documentTitle, msgStr, realm.displayName]);

	useSetClassName({
		qualifiedName: "body",
		className: bodyClassName,
	});

	const { isReadyToRender } = useInitialize({ kcContext, doUseDefaultCss });

	if (!isReadyToRender) {
		return null;
	}

	return (
		<div
			className="flex min-h-screen flex-col items-center justify-center gap-6 py-12 bg-cover bg-top bg-[#EEF1F5] px-4"
			style={{ backgroundImage: `url(${background})` }}
		>
			<header>
				<img src={j26Logo} alt="Jamboree 2026" className="h-20" />
			</header>

			<div className="w-full max-w-110 flex flex-col gap-4.5 bg-white rounded-[14px] border border-[#E7EAF0] shadow-card pt-9 px-10 pb-8">
				{/* Language switcher — only when realm has multiple languages */}
				{/* {enabledLanguages.length > 1 && (
					<nav id="kc-locale" aria-label={msgStr("languages")}>
						<ul className="flex gap-3 list-none p-0 m-0 text-[13px]">
							{enabledLanguages.map(({ languageTag, label, href }) => (
								<li key={languageTag}>
									<a
										href={href}
										aria-current={
											languageTag === currentLanguage.languageTag
												? "true"
												: undefined
										}
										className={
											languageTag === currentLanguage.languageTag
												? "font-semibold text-[#28354C]"
												: "text-[#4E84BE] no-underline hover:underline"
										}
									>
										{label}
									</a>
								</li>
							))}
						</ul>
					</nav>
				)} */}

				{/* Heading — show attempted username in multi-step flows */}
				{auth?.showUsername && !auth.showResetCredentials ? (
					<div
						id="kc-username"
						className="flex items-center justify-between gap-4"
					>
						<span
							id="kc-attempted-username"
							className="text-[15px] font-semibold text-[#28354C]"
						>
							{auth.attemptedUsername}
						</span>
						<a
							id="reset-login"
							href={url.loginRestartFlowUrl}
							aria-label={msgStr("restartLoginTooltip")}
							className="text-[#4E84BE] text-[13px] no-underline hover:underline whitespace-nowrap"
						>
							{msg("restartLoginTooltip")}
						</a>
					</div>
				) : (
					headerNode
				)}

				{/* Global Keycloak message (session expired, account locked, etc.) */}
				{displayMessage &&
					message !== undefined &&
					(message.type !== "warning" || !isAppInitiatedAction) && (
						<ScoutCallout
							variant={message.type as "info" | "success" | "warning" | "error"}
						>
							<span
								dangerouslySetInnerHTML={{
									__html: kcSanitize(message.summary),
								}}
							/>
						</ScoutCallout>
					)}

				{children}

				{/* "Try another way" — shown when user has alternative auth methods */}
				{auth?.showTryAnotherWayLink && (
					<form
						id="kc-select-try-another-way-form"
						action={url.loginAction}
						method="post"
					>
						<input type="hidden" name="tryAnotherWay" value="on" />
						{/* biome-ignore lint/a11y/useValidAnchor: Keycloak pattern requires form submit via anchor */}
						<a
							href="#"
							id="try-another-way"
							className="text-[#4E84BE] text-[13.5px] font-semibold no-underline hover:underline"
							onClick={(e) => {
								e.preventDefault();
								(
									document.getElementById(
										"kc-select-try-another-way-form",
									) as HTMLFormElement
								).submit();
							}}
						>
							{msg("doTryAnotherWay")}
						</a>
					</form>
				)}

				{socialProvidersNode}

				{displayInfo && infoNode}
			</div>

			<footer className="flex items-center gap-3 text-[#666D7B]">
				<svg
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 21 20"
					className="w-8 h-8 shrink-0 fill-[#828B9C]"
				>
					<path d="M13.4,6.2c0.6-0.8,1-1.7,1-2.5c0-0.5-0.1-1-0.3-1.4c-0.5-1.1-1.6-1.9-3-2.2c0.9,0.8,2.6,2.4,2.6,4.8 C13.6,5.3,13.5,5.7,13.4,6.2L13.4,6.2z M6.9,6.2C6.8,5.7,6.7,5.3,6.7,4.8c0-2.4,1.6-4.1,2.6-4.8c-1.4,0.4-2.5,1.1-3,2.2 C6.1,2.7,6,3.2,6,3.6C6,4.5,6.3,5.4,6.9,6.2L6.9,6.2z M18.4,14.4c-0.7,0.3-3.1,1-5-1.7c-0.1,0.3-0.2,0.7-0.2,1.1 c0.3,0.2,0.4,0.5,0.4,0.7s-0.1,0.5-0.4,0.7c0.2,0.8,1,1.6,1.9,1.7c2.7,0.4,4-2,4.5-3.3C19.4,13.9,19,14.2,18.4,14.4L18.4,14.4z M10.2,15.9L10.2,15.9c-0.1,0-0.3,0-0.5,0c-0.1,1.3-0.2,2.7-1.5,3.9C9,20,9.9,20,10.2,20l0,0c0.2,0,1.2,0,1.9-0.2 c-1.3-1.2-1.4-2.6-1.5-3.9C10.5,15.9,10.2,15.9,10.2,15.9L10.2,15.9z M15.2,5c1.8-0.9,3-0.6,3.7-0.1c-1.4-2.3-3.4-3.5-4.4-4 c0.5,0.5,1.1,1.4,1.1,2.6C15.5,3.9,15.4,4.4,15.2,5L15.2,5z M12.5,15.9L12.5,15.9c0,0,0-0.1-0.1-0.3c-0.3,0.1-0.6,0.1-0.9,0.2 c0.1,1.7,0.9,2.9,2.3,3.5c1-0.3,2-0.9,2.5-1.3C13.2,18.4,12.5,16.2,12.5,15.9L12.5,15.9z M16.5,10.8c0.2,0.3,0.3,0.5,0.3,0.8 c0,0.1,0,0.3-0.1,0.4c0.3-0.1,0.7-0.4,1.1-1.1c0.2-0.5,0.3-0.9,0.3-1.3c0-1.2-0.9-1.8-1.3-2c-1.3-0.6-3.3-0.2-4,1.1 c-1,1.7-1.2,3.7-1.2,4.5c0.3,0,0.6,0.1,0.8,0.2v-0.1c0.2-1.6,1.1-2.8,2.2-3.1C15.4,10.1,16.1,10.3,16.5,10.8L16.5,10.8z M5.7,10.3 c1.1,0.3,2,1.5,2.2,3.1v0.1c0.3-0.1,0.5-0.1,0.8-0.2c-0.1-0.8-0.2-2.8-1.2-4.5c-0.7-1.4-2.7-1.7-4-1.1C3.1,7.8,2.2,8.4,2.2,9.6 c0,0.4,0.1,0.8,0.3,1.3c0.3,0.7,0.8,1,1.1,1.1c0-0.1-0.1-0.2-0.1-0.4c0-0.3,0.1-0.5,0.3-0.8C4.3,10.3,5,10.1,5.7,10.3L5.7,10.3z M7.9,15.9C7.8,16.2,7.1,18.4,4,18c0.6,0.4,1.5,1,2.5,1.3c1.4-0.7,2.2-1.8,2.3-3.5c-0.3,0-0.6-0.1-0.9-0.2 C7.9,15.7,7.9,15.9,7.9,15.9L7.9,15.9z M10.2,15.1c1.7,0,2.5-0.4,2.6-0.5c-0.1-0.1-0.9-0.5-2.6-0.5h-0.1c-1.7,0-2.5,0.4-2.6,0.5 C7.7,14.7,8.5,15.1,10.2,15.1L10.2,15.1z M5.2,5C4.9,4.4,4.8,3.9,4.8,3.4c0-1.1,0.6-2,1.1-2.6c-1,0.5-3,1.7-4.4,4 C2.2,4.4,3.4,4,5.2,5L5.2,5z M8.4,7.8L8.8,9c0.2,0.5,0.4,1,0.5,1.6c0.2,1,0.3,1.8,0.3,2.5v0.1l0,0c0.2,0,0.4,0,0.4,0h0.1 c0,0,0.3,0,0.4,0v-0.1c0-0.7,0.1-1.5,0.3-2.4c0.1-0.6,0.3-1.1,0.5-1.6l0.4-1.2c0.3-0.8,0.4-1.5,0.4-2.2c0-2.8-1.7-5-2.2-5.5 C9.7,0.6,8,2.7,8,5.6C8,6.3,8.1,7,8.4,7.8L8.4,7.8z M16.7,13.6c0.9,0,1.7-0.3,2.3-1c0.8-0.8,1.3-1.9,1.3-3.1S19.8,7.2,19,6.4 c-0.7-0.6-1.5-1-2.4-1c-1.2,0-2,0.7-2.6,1.3c2-0.8,3.8-0.1,4.6,1c0.7,1,0.8,2.3,0.2,3.3c-0.6,1.2-1.8,1.9-3.3,1.9h-0.4l0.3-0.3 c0.1-0.1,0.3-0.6,0.3-0.9c0-0.2-0.2-0.4-0.5-0.5s-0.8-0.1-1.2,0.2c-0.1,0.1-0.2,0.2-0.3,0.3C14.6,13,15.6,13.6,16.7,13.6L16.7,13.6z M7.1,15.2c-0.2-0.2-0.4-0.4-0.4-0.7c0-0.2,0.1-0.5,0.4-0.7c0-0.4-0.1-0.8-0.2-1.1c-1.9,2.7-4.3,2-5,1.7c-0.6-0.2-1-0.6-1.3-0.9 c0.5,1.3,1.8,3.8,4.5,3.3C6,16.7,6.9,16,7.1,15.2L7.1,15.2z M3.6,13.6c-0.9,0-1.7-0.3-2.3-1C0.5,11.9,0,10.8,0,9.6s0.5-2.3,1.3-3.1 c0.7-0.6,1.5-1,2.4-1c1.2,0,2,0.7,2.6,1.3c-2-0.8-3.8-0.1-4.6,1c-0.7,1-0.8,2.3-0.2,3.3c0.5,1.2,1.7,1.9,3.2,2h0.4l-0.3-0.3 c-0.1-0.1-0.3-0.6-0.3-0.9c0-0.2,0.2-0.4,0.5-0.5s0.8-0.1,1.2,0.2c0.1,0.1,0.2,0.2,0.3,0.3C5.7,13,4.8,13.6,3.6,13.6L3.6,13.6z" />
				</svg>

				<div className="flex flex-col gap-0">
					<p className="text-[12px] m-0">En e-tjänst från Scouterna</p>
					<a
						href="https://www.scouterna.se/personuppgiftsbehandling/"
						className="text-[12px] underline hover:underline"
					>
						Personuppgiftsbehandling
					</a>
				</div>
			</footer>
		</div>
	);
}
