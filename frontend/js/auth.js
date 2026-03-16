(function () {
    const USERS_KEY = "turbocup_users";
    const SESSION_KEY = "turbocup_session";
    const DEFAULT_USER = {
        name: "Turbo Admin",
        email: "demo@turbocup.app",
        password: "TurboCup123!"
    };

    function readJson(key, fallback) {
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) {
                return fallback;
            }
            const parsed = JSON.parse(raw);
            return parsed || fallback;
        } catch (error) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        window.localStorage.setItem(key, JSON.stringify(value));
    }

    function normalizeEmail(email) {
        return String(email || "").trim().toLowerCase();
    }

    function sanitizeUser(user) {
        return {
            name: user.name,
            email: user.email
        };
    }

    function getUsers() {
        return readJson(USERS_KEY, []);
    }

    function saveUsers(users) {
        writeJson(USERS_KEY, users);
    }

    function seedDefaultUser() {
        const users = getUsers();
        const exists = users.some((user) => normalizeEmail(user.email) === normalizeEmail(DEFAULT_USER.email));
        if (!exists) {
            users.push(DEFAULT_USER);
            saveUsers(users);
        }
    }

    function getSession() {
        return readJson(SESSION_KEY, null);
    }

    function setSession(user) {
        writeJson(SESSION_KEY, sanitizeUser(user));
    }

    function clearSession() {
        window.localStorage.removeItem(SESSION_KEY);
    }

    function login(email, password) {
        const users = getUsers();
        const normalizedEmail = normalizeEmail(email);
        const user = users.find((item) => normalizeEmail(item.email) === normalizedEmail);

        if (!user || user.password !== password) {
            return { ok: false, error: "Invalid email or password." };
        }

        setSession(user);
        return { ok: true, user: sanitizeUser(user) };
    }

    function register(name, email, password) {
        const normalizedEmail = normalizeEmail(email);
        const normalizedName = String(name || "").trim();

        if (!normalizedName) {
            return { ok: false, error: "Name is required." };
        }

        if (!normalizedEmail) {
            return { ok: false, error: "Email is required." };
        }

        if (!password || password.length < 6) {
            return { ok: false, error: "Password must be at least 6 characters." };
        }

        const users = getUsers();
        const exists = users.some((user) => normalizeEmail(user.email) === normalizedEmail);
        if (exists) {
            return { ok: false, error: "This email is already registered." };
        }

        const newUser = {
            name: normalizedName,
            email: normalizedEmail,
            password: password
        };
        users.push(newUser);
        saveUsers(users);
        setSession(newUser);
        return { ok: true, user: sanitizeUser(newUser) };
    }

    function logout() {
        clearSession();
    }

    function isAuthenticated() {
        return !!getSession();
    }

    function requireAuth() {
        if (isAuthenticated()) {
            return true;
        }

        const next = encodeURIComponent(window.location.pathname.split("/").pop() || "index.html");
        window.location.href = `login.html?next=${next}`;
        return false;
    }

    seedDefaultUser();

    window.fakeAuth = {
        login,
        register,
        logout,
        getSession,
        isAuthenticated,
        requireAuth,
        defaultCredentials: {
            email: DEFAULT_USER.email,
            password: DEFAULT_USER.password
        }
    };
})();
