(function () {
    function createNotice(message) {
        const notice = document.createElement("section");
        notice.className = "panel dynamic-notice";
        notice.style.marginBottom = "14px";
        notice.innerHTML = `
            <h2 style="margin: 0 0 8px;">Notice</h2>
            <p style="margin: 0; color: #d1d5db;">${message}</p>
        `;
        return notice;
    }

    document.addEventListener("DOMContentLoaded", function () {
        if (!window.fakeAuth) {
            return;
        }

        const form = document.querySelector("form.form-layout");
        const pageShell = document.querySelector(".page-shell");
        if (!form || !pageShell) {
            return;
        }

        const isAuthed = window.fakeAuth.isAuthenticated();
        if (!isAuthed) {
            const loginUrl = `login.html?next=${encodeURIComponent("create_tournament.html")}`;
            const message = `You must be logged in to create tournaments. Please <a href="${loginUrl}" style="color:#f9a8d4;">log in</a>.`;
            const authNotice = createNotice(message);
            authNotice.querySelector("h2").textContent = "Authentication required";
            pageShell.insertBefore(authNotice, form);

            const controls = form.querySelectorAll("input, button, textarea, select");
            controls.forEach((control) => {
                control.disabled = true;
            });
            return;
        }

        form.addEventListener("submit", async function (event) {
            event.preventDefault(); // Evitamos que la página se recargue

            const oldNotices = document.querySelectorAll(".dynamic-notice");
            oldNotices.forEach(notice => notice.remove());

            // 1. Se recopilan todos los datos que el administrador ha escrito en el formulario
            const formData = new FormData(form);

            // 2. Se formatean las fechas
            const rawStartDate = formData.get("startDate");
            const rawEndDate = formData.get("endDate");
            const cleanStartDate = rawStartDate ? rawStartDate.split('T')[0] : "";
            const cleanEndDate = rawEndDate ? rawEndDate.split('T')[0] : "";

            // 3. Se crean los datos para pasarselos a Flask
            // Montamos el JSON incluyendo la nueva categoría
            const payload = {
                name: formData.get("tournamentName"),
                category: formData.get("category"),
                start_date: cleanStartDate,
                end_date: cleanEndDate,
            };

            try {
                const response = await fetch('http://127.0.0.1:5000/api/tournaments/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || "Error al crear el torneo");
                }

                // 4. Caso de éxito
                const successNotice = createNotice("Tournament successfully saved to database!");
                successNotice.querySelector("h2").textContent = "Created successfully";
                successNotice.style.borderLeft = "4px solid #10b981"; // Un toque verde de éxito
                pageShell.insertBefore(successNotice, form);

                form.reset();

            } catch (error) {
                // Si Flask devuelve un error 400 o el servidor está apagado
                const errorNotice = createNotice(error.message);
                errorNotice.querySelector("h2").textContent = "Error saving tournament";
                errorNotice.style.borderLeft = "4px solid #ef4444"; // Rojo
                pageShell.insertBefore(errorNotice, form);
                console.error("Error backend:", error);
            }
        });
    });
})();
