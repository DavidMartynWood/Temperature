const root = document.documentElement;
const themeToggle = document.querySelector("#theme-toggle");
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function writeStorage(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Preference just won't be remembered.
	}
}

function isDark() {
	const chosen = root.dataset.theme;
	return chosen ? chosen === "dark" : darkQuery.matches;
}

function renderTheme(notify) {
	if (!themeToggle) {
		return;
	}
	const label = isDark() ? "Switch to light mode" : "Switch to dark mode";
	themeToggle.setAttribute("aria-label", label);
	themeToggle.title = label;
	themeToggle.setAttribute("aria-pressed", String(isDark()));
	if (notify) {
		document.dispatchEvent(new Event("themechange"));
	}
}

if (themeToggle) {
	themeToggle.addEventListener("click", () => {
		root.dataset.theme = isDark() ? "light" : "dark";
		writeStorage("theme", root.dataset.theme);
		renderTheme(true);
	});
	darkQuery.addEventListener("change", () => renderTheme(true));
	renderTheme(false);
}
