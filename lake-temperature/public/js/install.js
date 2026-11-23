const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_VISITS = 2;

function read(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Preference just won't be remembered.
	}
}

const onInstallPage = window.location.pathname.replace(/\.html$|\/$/g, "") === "/install";
const inAppFallback = new URLSearchParams(window.location.search).get("open-in-browser") === "1";
const isIos =
	/iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
	(window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
const inAppBrowser = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger/i.test(window.navigator.userAgent);
const isStandalone =
	window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
let deferred = null;

const visits = Number(read("pwaVisits") || 0) + 1;
write("pwaVisits", String(visits));

function dismissedRecently() {
	const at = Number(read("pwaDismissedAt") || 0);
	return Date.now() - at < COOLDOWN_MS;
}

function alreadyInstalled() {
	return read("pwaInstalled") === "1";
}

function show(selector, visible) {
	const el = document.querySelector(selector);
	if (el) {
		el.hidden = !visible;
	}
}

function renderInstallPage() {
	show("#install-inapp", inAppBrowser);
	show("#install-inapp-ios", inAppBrowser && isIos);
	show("#install-inapp-android", inAppBrowser && !isIos);
	show("#install-inapp-android-open", inAppBrowser && !isIos && !inAppFallback);
	show("#install-inapp-android-fallback", inAppBrowser && !isIos && inAppFallback);
	show("#install-ready", !inAppBrowser && (deferred !== null || "install" in navigator));
	show("#install-ios", !inAppBrowser && isIos);
	show("#install-manual", !inAppBrowser && deferred === null && !isIos && !("install" in navigator));
}

function removePrompt() {
	document.querySelector("#install-prompt")?.remove();
	document.body.classList.remove("install-prompt-open");
}

function dismissPrompt() {
	write("pwaDismissedAt", String(Date.now()));
	removePrompt();
}

function showPrompt() {
	const host = document.querySelector("main[data-install-prompt]");
	const iosBanner = isIos && !inAppBrowser;
	if (
		onInstallPage ||
		isStandalone ||
		alreadyInstalled() ||
		!host ||
		(visits < MIN_VISITS && !inAppBrowser) ||
		dismissedRecently() ||
		document.querySelector("#install-prompt") ||
		(!deferred && !inAppBrowser && !iosBanner)
	) {
		return;
	}

	const bar = document.createElement("div");
	bar.id = "install-prompt";
	bar.className = "install-prompt";
	const text = document.createElement("p");
	const actions = document.createElement("p");
	actions.className = "install-prompt-actions";

	const dismiss = document.createElement("button");
	dismiss.type = "button";
	dismiss.className = "link-button";
	dismiss.textContent = "Not now";
	dismiss.addEventListener("click", dismissPrompt);

	if (inAppBrowser) {
		text.textContent = "Install the app";
		const install = document.createElement("a");
		install.href = "/install";
		install.className = "link-button";
		install.textContent = "Install the app";
		actions.append(install, dismiss);
	} else if (iosBanner) {
		text.append("Add Ice Warriors to your Home Screen: tap ");
		const share = document.createElement("strong");
		share.textContent = "Share";
		text.append(share, ", then ");
		const add = document.createElement("strong");
		add.textContent = "Add to Home Screen";
		text.append(add, ".");
		const how = document.createElement("a");
		how.href = "/install";
		how.className = "link-button";
		how.textContent = "How";
		actions.append(how, dismiss);
	} else {
		text.textContent = "Get the water temperature in one tap.";
		const install = document.createElement("button");
		install.type = "button";
		install.className = "link-button";
		install.textContent = "Install app";
		install.addEventListener("click", promptInstall);
		actions.append(install, dismiss);
	}

	bar.append(text, actions);
	document.body.append(bar);
	document.body.classList.add("install-prompt-open");
}

async function promptInstall() {
	removePrompt();
	try {
		if ("install" in navigator && typeof navigator.install === "function") {
			await navigator.install();
			return;
		}
		if (!deferred) return;
		const event = deferred;
		deferred = null;
		await event.prompt();
		const { outcome } = await event.userChoice;
		if (outcome === "dismissed") {
			write("pwaDismissedAt", String(Date.now()));
		}
		if (outcome === "accepted") {
			write("pwaInstalled", "1");
		}
	} catch {
		// The visitor dismissed the browser prompt, or this browser has no install API.
	}
	renderInstallPage();
}

window.addEventListener("beforeinstallprompt", (event) => {
	event.preventDefault();
	deferred = event;
	renderInstallPage();
	showPrompt();
});

window.addEventListener("appinstalled", () => {
	write("pwaInstalled", "1");
	removePrompt();
	renderInstallPage();
});

document.querySelector("#install-button")?.addEventListener("click", promptInstall);

const installUrl = `${window.location.origin}/install`;
const fallbackUrl = new URL(installUrl);
fallbackUrl.searchParams.set("open-in-browser", "1");
const chromeLink = document.querySelector("#open-chrome");
if (chromeLink instanceof HTMLAnchorElement) {
	chromeLink.href = `intent://${window.location.host}/install#Intent;scheme=${window.location.protocol.slice(0, -1)};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fallbackUrl.toString())};end`;
}

const installLink = document.querySelector("#install-link");
if (installLink instanceof HTMLAnchorElement) {
	installLink.href = installUrl;
	installLink.textContent = installUrl;
}

async function copyLink(statusSelector, browserName) {
	const status = document.querySelector(statusSelector);
	try {
		await navigator.clipboard.writeText(installUrl);
		if (status) status.textContent = `Link copied. Now paste it into ${browserName}.`;
	} catch {
		// Clipboard access can be blocked in in-app browsers, so show the link to copy by hand.
		if (status) status.textContent = `Copy this link into ${browserName}: ${installUrl}`;
	}
}

document.querySelector("#copy-link")?.addEventListener("click", () => copyLink("#copy-link-status", "Safari"));
document.querySelector("#copy-link-android")?.addEventListener("click", () =>
	copyLink("#copy-link-android-status", "your browser"),
);
renderInstallPage();
showPrompt();
