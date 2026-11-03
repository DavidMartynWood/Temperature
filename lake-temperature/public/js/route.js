const opener = document.querySelector(".route-open");
const dialog = document.querySelector("#route-dialog");

if (opener instanceof HTMLButtonElement && dialog instanceof HTMLDialogElement) {
	opener.addEventListener("click", () => {
		dialog.showModal();
	});

	dialog.addEventListener("click", (event) => {
		if (event.target === dialog) {
			dialog.close();
		}
	});
}
