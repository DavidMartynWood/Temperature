const STORAGE_KEY = "partners-uncovered";
const MASK = "••••••••";

/**
 * @typedef {{ label: string, link: string }} PartnerAction
 * @typedef {{ portrait: string, square: string, alt: string }} PartnerImage
 * @typedef {{ id: string, name: string, logo?: string, offer: string, code?: string, link?: string, terms?: string, earnsCommission?: boolean, visibility: "public" | "members", order: number, intro?: string, steps?: string[], note?: string, actions?: PartnerAction[], shopLink?: string | null, image?: PartnerImage }} Partner
 * @typedef {{ code?: string, link?: string }} HiddenFields
 */

/** @param {Partner[]} partners */
export function sortPartners(partners) {
	return [...partners].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** @param {Partner[]} partners */
export function hasMembersPartners(partners) {
	return partners.some((partner) => partner.visibility === "members");
}

/** @returns {Record<string, HiddenFields>} */
function readStoredSecrets() {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		return parsed;
	} catch {
		return {};
	}
}

/** @param {Record<string, HiddenFields>} secrets */
function writeStoredSecrets(secrets) {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(secrets));
	} catch {
		/* ignore quota / private mode */
	}
}

/**
 * @param {HTMLElement} codeEl
 * @param {HTMLButtonElement} copyBtn
 * @param {string} code
 */
function revealCode(codeEl, copyBtn, code) {
	codeEl.textContent = code;
	codeEl.dataset.code = code;
	copyBtn.disabled = false;
	copyBtn.setAttribute("aria-label", `Copy code ${code}`);
	copyBtn.title = `Copy code ${code}`;
}

/**
 * @param {string} code
 * @param {HTMLButtonElement} button
 */
async function copyCode(code, button) {
	try {
		await navigator.clipboard.writeText(code);
		const previous = button.textContent;
		button.textContent = "Copied";
		window.setTimeout(() => {
			button.textContent = previous;
		}, 1500);
	} catch {
		button.textContent = "Copy failed";
	}
}

const URL_IN_TEXT = /https?:\/\/[^\s]+/g;

/**
 * @param {HTMLElement} parent
 * @param {string} text
 */
function appendTextWithLinks(parent, text) {
	let last = 0;
	for (const match of text.matchAll(URL_IN_TEXT)) {
		const raw = match[0];
		const url = raw.replace(/[.)]+$/, "");
		const index = match.index ?? 0;
		if (index > last) {
			parent.append(text.slice(last, index));
		}
		const link = document.createElement("a");
		link.href = url;
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		link.textContent = url;
		parent.append(link);
		const trailing = raw.slice(url.length);
		if (trailing) parent.append(trailing);
		last = index + raw.length;
	}
	if (last < text.length) parent.append(text.slice(last));
}

/**
 * Full-width guide for a partner that explains the steps instead of showing a code.
 * @param {Partner} partner
 * @returns {{ card: HTMLElement, applyHidden: (fields: HiddenFields) => void }}
 */
function renderGuide(partner) {
	const article = document.createElement("article");
	article.className = "partner-guide";
	article.dataset.partnerId = partner.id;

	const title = document.createElement("h2");
	title.className = "partner-guide-title";
	title.textContent = partner.offer;

	const picture = document.createElement("picture");
	if (partner.image) {
		const source = document.createElement("source");
		source.media = "(min-width: 40rem)";
		source.srcset = partner.image.portrait;
		source.width = 1080;
		source.height = 1350;
		const img = document.createElement("img");
		img.src = partner.image.square;
		img.alt = partner.image.alt;
		img.width = 1080;
		img.height = 1080;
		img.loading = "lazy";
		picture.append(source, img);
	}

	const copy = document.createElement("div");
	copy.className = "partner-guide-copy";

	if (partner.intro) {
		const intro = document.createElement("p");
		intro.textContent = partner.intro;
		copy.append(intro);
	}

	const steps = document.createElement("ol");
	for (const step of partner.steps ?? []) {
		const item = document.createElement("li");
		appendTextWithLinks(item, step);
		steps.append(item);
	}
	copy.append(steps);

	if (partner.note) {
		const note = document.createElement("p");
		note.className = "note";
		note.textContent = partner.note;
		copy.append(note);
	}

	const actions = document.createElement("div");
	actions.className = "partner-guide-actions";
	for (const action of partner.actions ?? []) {
		const link = document.createElement("a");
		link.className = "partner-shop";
		link.href = action.link;
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		link.textContent = action.label;
		actions.append(link);
	}
	if (partner.shopLink) {
		const shop = document.createElement("a");
		shop.className = "partner-shop";
		shop.href = partner.shopLink;
		shop.target = "_blank";
		shop.rel = "noopener noreferrer sponsored";
		shop.textContent = "Shop ProSwimwear";
		actions.append(shop);
	}
	copy.append(actions);

	article.append(title, picture, copy);
	return { card: article, applyHidden() {} };
}

/**
 * Compact offer row: logo/name, offer, code + copy + shop (Hart/Chester style).
 * @param {Partner} partner
 * @param {HiddenFields | undefined} hidden
 * @returns {{ card: HTMLElement, applyHidden: (fields: HiddenFields) => void }}
 */
function renderCard(partner, hidden) {
	const isMembers = partner.visibility === "members";
	const code = isMembers ? hidden?.code : partner.code;
	const link = (isMembers && hidden?.link) || partner.link;
	const revealed = Boolean(code);

	const article = document.createElement("article");
	article.className = "partner-row";
	article.dataset.partnerId = partner.id;
	article.setAttribute("aria-labelledby", `partner-${partner.id}-name`);

	const brand = document.createElement("div");
	brand.className = "partner-brand";

	const name = document.createElement("h2");
	name.id = `partner-${partner.id}-name`;
	name.className = partner.logo ? "visually-hidden" : "partner-name";
	name.textContent = partner.name;
	brand.append(name);

	if (partner.logo) {
		const img = document.createElement("img");
		img.className = "partner-logo";
		img.src = partner.logo;
		img.alt = "";
		img.loading = "lazy";
		brand.append(img);
	}

	const offer = document.createElement("p");
	offer.className = "partner-offer";
	offer.textContent = partner.offer;

	const actions = document.createElement("div");
	actions.className = "partner-actions";

	const codeEl = document.createElement("code");
	codeEl.className = "partner-code";
	codeEl.dataset.role = "code";
	codeEl.textContent = revealed ? code : MASK;
	if (revealed) codeEl.dataset.code = code;

	const copyBtn = document.createElement("button");
	copyBtn.type = "button";
	copyBtn.className = "partner-copy";
	copyBtn.textContent = "Copy";
	copyBtn.disabled = !revealed;
	if (revealed) {
		copyBtn.setAttribute("aria-label", `Copy code ${code}`);
	} else {
		copyBtn.setAttribute("aria-label", `Copy code for ${partner.name}`);
	}
	copyBtn.addEventListener("click", () => {
		const value = codeEl.dataset.code;
		if (value) copyCode(value, copyBtn);
	});

	actions.append(codeEl, copyBtn);

	/** @type {HTMLAnchorElement | null} */
	let shopLink = null;
	if (link) {
		shopLink = document.createElement("a");
		shopLink.className = "partner-shop";
		shopLink.href = link;
		shopLink.target = "_blank";
		shopLink.rel = partner.earnsCommission ? "noopener noreferrer sponsored" : "noopener noreferrer";
		shopLink.textContent = "Shop";
		actions.append(shopLink);
	}

	article.append(brand, offer, actions);

	return {
		card: article,
		applyHidden(fields) {
			if (fields.code) {
				revealCode(codeEl, copyBtn, fields.code);
			}
			if (fields.link && !shopLink) {
				shopLink = document.createElement("a");
				shopLink.className = "partner-shop";
				shopLink.href = fields.link;
				shopLink.target = "_blank";
				shopLink.rel = partner.earnsCommission ? "noopener noreferrer sponsored" : "noopener noreferrer";
				shopLink.textContent = "Shop";
				actions.append(shopLink);
			}
		},
	};
}

async function loadPartners() {
	const response = await fetch("/data/partners.json");
	if (!response.ok) throw new Error("Could not load partners");
	const data = await response.json();
	const list = Array.isArray(data) ? data : data.partners;
	if (!Array.isArray(list)) throw new Error("Invalid partners data");
	return sortPartners(list);
}

async function main() {
	const listEl = document.querySelector("#partner-list");
	if (!(listEl instanceof HTMLElement)) return;

	let partners;
	try {
		partners = await loadPartners();
	} catch {
		listEl.replaceChildren();
		const error = document.createElement("p");
		error.className = "copy";
		error.textContent = "Partner offers could not be loaded. Please try again later.";
		listEl.append(error);
		return;
	}

	let secrets = readStoredSecrets();
	/** @type {Map<string, (fields: HiddenFields) => void>} */
	const applyById = new Map();

	listEl.replaceChildren();
	for (const partner of partners) {
		if (!partner.code && partner.steps?.length) {
			listEl.append(renderGuide(partner).card);
			continue;
		}
		const hidden = partner.visibility === "members" ? secrets[partner.id] : undefined;
		const { card, applyHidden } = renderCard(partner, hidden);
		applyById.set(partner.id, applyHidden);
		listEl.append(card);
	}

	const uncover = document.querySelector("#uncover");
	if (uncover instanceof HTMLElement) {
		uncover.hidden = !hasMembersPartners(partners);
	}

	const uncoverOpen = document.querySelector("#uncover-open");
	const uncoverForm = document.querySelector("#uncover-form");
	const uncoverError = document.querySelector("#uncover-error");
	const passphraseInput = document.querySelector("#uncover-passphrase");

	if (!(uncoverOpen instanceof HTMLButtonElement) || !(uncoverForm instanceof HTMLFormElement)) {
		return;
	}

	uncoverOpen.addEventListener("click", () => {
		uncoverForm.hidden = false;
		uncoverOpen.hidden = true;
		if (passphraseInput instanceof HTMLInputElement) passphraseInput.focus();
	});

	uncoverForm.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (!(passphraseInput instanceof HTMLInputElement)) return;
		if (uncoverError instanceof HTMLElement) {
			uncoverError.hidden = true;
			uncoverError.textContent = "";
		}

		const passphrase = passphraseInput.value;
		const submit = uncoverForm.querySelector('button[type="submit"]');
		if (submit instanceof HTMLButtonElement) submit.disabled = true;

		try {
			const response = await fetch("/api/partners/uncover", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ passphrase }),
			});
			const payload = await response.json().catch(() => ({}));

			if (response.status === 429) {
				throw new Error(payload.error || "Too many attempts. Try again later.");
			}
			if (!response.ok) {
				throw new Error(payload.error || "That passphrase isn’t right.");
			}

			secrets = { ...secrets, ...(payload.partners || {}) };
			writeStoredSecrets(secrets);

			for (const partner of partners) {
				if (partner.visibility !== "members") continue;
				const apply = applyById.get(partner.id);
				const fields = secrets[partner.id];
				if (apply && fields) apply(fields);
			}

			uncoverForm.hidden = true;
			passphraseInput.value = "";
		} catch (error) {
			if (uncoverError instanceof HTMLElement) {
				uncoverError.textContent = error instanceof Error ? error.message : "Something went wrong.";
				uncoverError.hidden = false;
			}
		} finally {
			if (submit instanceof HTMLButtonElement) submit.disabled = false;
		}
	});
}

if (typeof document !== "undefined") {
	main();
}
