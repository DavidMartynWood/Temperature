const pages = [
	{ href: "/", label: "Home" },
	{ href: "/about", label: "About" },
	{ href: "/team", label: "Meet the team" },
	{ href: "/events", label: "Events" },
	{ href: "/partners", label: "Partners" },
];

function currentPath() {
	let path = window.location.pathname;
	if (path.endsWith("/index.html")) {
		path = path.slice(0, -"index.html".length);
	}
	if (path.endsWith(".html")) {
		path = path.slice(0, -".html".length);
	}
	if (path.length > 1 && path.endsWith("/")) {
		path = path.slice(0, -1);
	}
	return path || "/";
}

const nav = document.querySelector("#site-nav");

if (nav) {
	nav.classList.add("site-nav");
	const here = currentPath();
	const toggle = document.createElement("button");
	toggle.type = "button";
	toggle.className = "icon-button nav-toggle";
	toggle.setAttribute("aria-expanded", "false");
	toggle.setAttribute("aria-controls", "site-menu");
	toggle.setAttribute("aria-label", "Open menu");
	toggle.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>`;

	const menu = document.createElement("div");
	menu.id = "site-menu";
	menu.className = "nav-links";

	for (const page of pages) {
		const link = document.createElement("a");
		link.href = page.href;
		link.textContent = page.label;
		if (page.href === here) {
			link.setAttribute("aria-current", "page");
		}
		menu.append(link);
	}

	const tools = nav.parentElement?.querySelector(":scope > .toolbar");
	if (tools) {
		menu.append(tools);
	}

	function setOpen(open) {
		nav.classList.toggle("is-open", open);
		toggle.setAttribute("aria-expanded", String(open));
		toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
	}

	toggle.addEventListener("click", () => {
		setOpen(!nav.classList.contains("is-open"));
	});

	menu.addEventListener("click", (event) => {
		if (event.target instanceof HTMLAnchorElement) {
			setOpen(false);
		}
	});

	document.addEventListener("click", (event) => {
		if (nav.classList.contains("is-open") && !nav.contains(event.target)) {
			setOpen(false);
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && nav.classList.contains("is-open")) {
			setOpen(false);
			toggle.focus();
		}
	});

	nav.addEventListener("focusout", (event) => {
		if (!nav.classList.contains("is-open")) {
			return;
		}
		if (!(event.relatedTarget instanceof Node) || !nav.contains(event.relatedTarget)) {
			setOpen(false);
		}
	});

	nav.append(toggle, menu);
}
