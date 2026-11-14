// Push carries no payload: the Worker only pings us, and we fetch the current temperature here.
const MESSAGES = {
	saturday: "Join us for a dip this morning?",
	wednesday: "Join us for a swim this evening?",
};

function reminderKind() {
	const day = new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/London" });
	return day === "Saturday" ? "saturday" : "wednesday";
}

async function buildBody() {
	const message = MESSAGES[reminderKind()];
	try {
		// Browsers penalise pushes that don't show a notification quickly, so never wait long.
		const response = await fetch("/api/latest", { cache: "no-store", signal: AbortSignal.timeout(4000) });
		const { reading } = await response.json();
		if (reading) {
			return `${message} Water temperature is ${reading.temperature_c.toFixed(1)} °C`;
		}
	} catch {
		// Fall back to the message without a temperature.
	}
	return message;
}

self.addEventListener("push", (event) => {
	event.waitUntil(
		buildBody().then((body) =>
			self.registration.showNotification("Ice Warriors", {
				body,
				icon: "/images/icon-192.png",
				tag: "event-reminder",
			}),
		),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
			const open = windows.find((client) => "focus" in client);
			return open ? open.focus() : self.clients.openWindow("/");
		}),
	);
});

// Browsers can rotate subscriptions; move the saved choices to the new endpoint.
self.addEventListener("pushsubscriptionchange", (event) => {
	event.waitUntil(
		(async () => {
			const { key } = await (await fetch("/api/push/key")).json();
			const subscription = await self.registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: Uint8Array.from(
					atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=")),
					(character) => character.charCodeAt(0),
				),
			});
			await fetch("/api/push/subscribe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					endpoint: subscription.endpoint,
					previousEndpoint: event.oldSubscription?.endpoint,
				}),
			});
		})(),
	);
});
