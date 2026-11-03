const el = document.querySelector("#where-map");

if (el && window.L) {
	const place = [53.71495, -0.54882];
	const map = L.map(el, { scrollWheelZoom: false }).setView(place, 15);

	L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
		maxZoom: 19,
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
	}).addTo(map);

	L.marker(place).addTo(map);
} else if (el) {
	el.hidden = true;
}
