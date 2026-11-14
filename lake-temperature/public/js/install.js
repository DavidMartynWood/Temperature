const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
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
const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
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
	show("#install-ready", deferred !== null);
	show("#install-ios", isIos);
	show("#install-manual", deferred === null && !isIos);
}

function removePrompt() {
	document.querySelector("#install-prompt")?.remove();
}

function showPrompt() {
	if (
		onInstallPage ||
		!deferred ||
		visits < MIN_VISITS ||
		dismissedRecently() ||
		document.querySelector("#install-prompt")
	) {
		return;
	}
	const bar = document.createElement("p");
	bar.id = "install-prompt";
	bar.className = "install-prompt";
	const install = document.createElement("button");
	install.type = "button";
	install.className = "link-button";
	install.textContent = "Install the app";
	const dismiss = document.createElement("button");
	dismiss.type = "button";
	dismiss.className = "link-button";
	dismiss.setAttribute("aria-label", "Dismiss install prompt");
	dismiss.textContent = "Not now";
	install.addEventListener("click", promptInstall);
	dismiss.addEventListener("click", () => {
		write("pwaDismissedAt", String(Date.now()));
		removePrompt();
	});
	bar.append(install, " · ", dismiss);
	document.querySelector("footer")?.before(bar);
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
