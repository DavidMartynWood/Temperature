const STORAGE_KEY = "reminders";
const section = document.querySelector("#reminders");
const checkboxes = {
	saturday: document.querySelector("#reminder-saturday"),
	wednesday: document.querySelector("#reminder-wednesday"),
};
const status = document.querySelector("#reminders-status");

function setStatus(message) {
	status.textContent = message;
}

function saved() {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
	} catch {
		return {};
	}
}

function save(choices) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
	} catch {
		// Choices are still stored on the server.
	}
}

function keyToBytes(key) {
	const padded = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
	return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function post(path, body) {
	const response = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		throw new Error("Request failed");
	}
}

async function init() {
	if (!section) {
		return;
	}
	const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
	const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
	const response = await fetch("/api/push/key").catch(() => null);
	if (!response?.ok) {
		return;
	}
	section.hidden = false;
	if (!supported) {
		setStatus(isIos ? "On iPhone and iPad, add the app to your home screen first, then open it to turn on reminders." : "This browser doesn't support notifications.");
		return;
	}

	const { key } = await response.json();
	const registration = await navigator.serviceWorker.register("/sw.js");
	let subscription = await registration.pushManager.getSubscription();
	const choices = subscription ? saved() : {};
	for (const [name, box] of Object.entries(checkboxes)) {
		box.checked = Boolean(choices[name]);
		box.disabled = false;
	}

	// Re-sync on each visit so the server keeps a current endpoint for this device.
	if (subscription && (choices.saturday || choices.wednesday)) {
		post("/api/push/subscribe", { endpoint: subscription.endpoint, saturday: Boolean(choices.saturday), wednesday: Boolean(choices.wednesday) }).catch(() => {});
	}

	async function update() {
		const next = { saturday: checkboxes.saturday.checked, wednesday: checkboxes.wednesday.checked };
		setStatus("");
		try {
			if (!next.saturday && !next.wednesday) {
				if (subscription) {
					await post("/api/push/unsubscribe", { endpoint: subscription.endpoint });
					await subscription.unsubscribe();
					subscription = null;
				}
			} else {
				if (!subscription) {
					if ((await Notification.requestPermission()) !== "granted") {
						throw new Error("Notifications are blocked. Allow them in your browser settings and try again.");
					}
					subscription = await registration.pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey: keyToBytes(key),
					});
				}
				await post("/api/push/subscribe", { endpoint: subscription.endpoint, ...next });
			}
			save(next);
		} catch (error) {
			const previous = saved();
			checkboxes.saturday.checked = Boolean(subscription && previous.saturday);
			checkboxes.wednesday.checked = Boolean(subscription && previous.wednesday);
			setStatus(error.message === "Request failed" ? "Couldn't save your choice. Please try again." : error.message);
		}
	}

	for (const box of Object.values(checkboxes)) {
		box.addEventListener("change", update);
	}
}

init().catch(() => setStatus("Reminders aren't available right now."));
