// =====================================================================
// UNIT NOTES — full CRUD on the `notes` table (dashboard.html)
// Rendered inside the serial-lookup results. A logged-in user can:
//   Create  — add a note to a unit
//   Read    — list their notes for that unit
//   Update  — edit a note inline
//   Delete  — remove a note
// Row Level Security (see sql/notes_crud.sql) ensures each user only ever
// touches their own notes; user_id defaults to auth.uid() on insert.
// Exposes: window.renderUnitNotes(container, source, serial)
// =====================================================================
(function () {
    function esc(t) { const d = document.createElement("div"); d.textContent = t == null ? "" : t; return d.innerHTML; }
    function fmt(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        return isNaN(d) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    // READ
    async function render(container, source, serial) {
        container.innerHTML = '<p class="notes-loading">Loading notes…</p>';
        const { data, error } = await supabaseClient
            .from("notes")
            .select("id, body, created_at, updated_at")
            .eq("source", source).eq("serial", serial)
            .order("created_at", { ascending: false });

        if (error) { container.innerHTML = '<p class="notes-err">Couldn\'t load notes (see console).</p>'; console.error("notes read:", error); return; }

        const notes = data || [];
        const list = notes.length
            ? notes.map(noteRowHtml).join("")
            : '<p class="notes-empty">No notes yet for this unit.</p>';

        container.innerHTML =
            '<h4 class="notes-title">📝 Notes for ' + esc(serial) + '</h4>' +
            '<div class="notes-add">' +
            '  <textarea id="noteInput" class="notes-textarea" rows="2" placeholder="Add a note about this unit…"></textarea>' +
            '  <button type="button" id="noteAddBtn" class="notes-btn">Add note</button>' +
            '</div>' +
            '<div class="notes-list">' + list + '</div>';

        wire(container, source, serial);
    }

    function noteRowHtml(n) {
        const edited = n.updated_at && n.updated_at !== n.created_at ? " · edited" : "";
        return '<div class="note-item" data-id="' + n.id + '">' +
            '<div class="note-body">' + esc(n.body) + '</div>' +
            '<div class="note-meta"><span>' + fmt(n.created_at) + edited + '</span>' +
            '<span class="note-actions">' +
            '<button type="button" class="note-edit" data-id="' + n.id + '">Edit</button>' +
            '<button type="button" class="note-del" data-id="' + n.id + '">Delete</button>' +
            '</span></div></div>';
    }

    function wire(container, source, serial) {
        // CREATE
        const addBtn = container.querySelector("#noteAddBtn");
        const input = container.querySelector("#noteInput");
        addBtn.addEventListener("click", async function () {
            const body = input.value.trim();
            if (!body) { input.focus(); return; }
            addBtn.disabled = true; addBtn.textContent = "Adding…";
            const { error } = await supabaseClient.from("notes").insert({ source: source, serial: serial, body: body });
            if (error) { alert("Could not add note: " + error.message); addBtn.disabled = false; addBtn.textContent = "Add note"; return; }
            render(container, source, serial);
        });

        // DELETE
        container.querySelectorAll(".note-del").forEach(function (b) {
            b.addEventListener("click", async function () {
                if (!confirm("Delete this note?")) return;
                const id = b.getAttribute("data-id");
                const { error } = await supabaseClient.from("notes").delete().eq("id", id);
                if (error) { alert("Could not delete: " + error.message); return; }
                render(container, source, serial);
            });
        });

        // UPDATE (inline editor)
        container.querySelectorAll(".note-edit").forEach(function (b) {
            b.addEventListener("click", function () {
                const id = b.getAttribute("data-id");
                const item = container.querySelector('.note-item[data-id="' + id + '"]');
                const bodyDiv = item.querySelector(".note-body");
                const current = bodyDiv.textContent;
                bodyDiv.innerHTML =
                    '<textarea class="notes-textarea" rows="2"></textarea>' +
                    '<div class="note-edit-actions">' +
                    '<button type="button" class="notes-btn note-save">Save</button>' +
                    '<button type="button" class="note-cancel">Cancel</button></div>';
                const ta = bodyDiv.querySelector("textarea"); ta.value = current; ta.focus();

                bodyDiv.querySelector(".note-save").addEventListener("click", async function () {
                    const body = ta.value.trim();
                    if (!body) { ta.focus(); return; }
                    const { error } = await supabaseClient.from("notes")
                        .update({ body: body, updated_at: new Date().toISOString() }).eq("id", id);
                    if (error) { alert("Could not save: " + error.message); return; }
                    render(container, source, serial);
                });
                bodyDiv.querySelector(".note-cancel").addEventListener("click", function () { render(container, source, serial); });
            });
        });
    }

    window.renderUnitNotes = render;
})();
