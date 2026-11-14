const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
const MIN_VISITS = 3;

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
const isIos =
	/iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
	(window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
const inAppBrowser = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger/i.test(window.navigator.userAgent);
let deferred = null;

const visits = Number(read("pwaVisits") || 0) + 1;
write("pwaVisits", String(visits));

function dismissedRecently() {
	const at = Number(read("pwaDismissedAt") || 0);
	return Date.now() - at < COOLDOWN_MS;
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
	show("#install-ready", !inAppBrowser && deferred !== null);
	show("#install-ios", !inAppBrowser && isIos);
	show("#install-manual", !inAppBrowser && deferred === null && !isIos);
}

function removePrompt() {
	document.querySelector("#install-prompt")?.remove();
}

function showPrompt() {
	const current = document.querySelector("#current");
	if (
		onInstallPage ||
		(!deferred && !inAppBrowser) ||
		!current ||
		(visits < MIN_VISITS && !inAppBrowser) ||
		dismissedRecently() ||
		document.querySelector("#install-prompt")
	) {
		return;
	}
	const bar = document.createElement("p");
	bar.id = "install-prompt";
	bar.className = "install-prompt";
	const install = inAppBrowser ? document.createElement("a") : document.createElement("button");
	if (inAppBrowser) {
		install.href = "/install";
		install.textContent = "Install the app";
	} else {
		install.type = "button";
		install.className = "link-button";
		install.textContent = "Install the app";
	}
	const dismiss = document.createElement("button");
	dismiss.type = "button";
	dismiss.className = "link-button";
	dismiss.setAttribute("aria-label", "Dismiss install prompt");
	dismiss.textContent = "Not now";
	if (!inAppBrowser) {
		install.addEventListener("click", promptInstall);
	}
	dismiss.addEventListener("click", () => {
		write("pwaDismissedAt", String(Date.now()));
		removePrompt();
	});
	bar.append(install, " · ", dismiss);
	current.before(bar);
}

async function promptInstall() {
	if (!deferred) {
		return;
	}
	const event = deferred;
	deferred = null;
	removePrompt();
	await event.prompt();
	const { outcome } = await event.userChoice;
	if (outcome === "dismissed") {
		write("pwaDismissedAt", String(Date.now()));
	}
	renderInstallPage();
}

window.addEventListener("beforeinstallprompt", (event) => {
	event.preventDefault();
	deferred = event;
	renderInstallPage();
	showPrompt();
});

document.querySelector("#install-button")?.addEventListener("click", promptInstall);
renderInstallPage();
showPrompt();
