document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-links a, .dropdown-item, .spa-page-link');
    const homeLink = document.getElementById('home-link');
    const dropdownBtn = document.querySelector('.dropdown-btn');
    const dropdownMenu = document.querySelector('.dropdown-menu');
    const mainContent = document.getElementById('main-content');

    // Abrir/cerrar menú desplegable
    dropdownBtn.addEventListener('click', (e) => {
        e.preventDefault();
        dropdownMenu.classList.toggle('show');
    });

    // Cerrar menú al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            dropdownMenu.classList.remove('show');
        }
    });

    // Manejar click en el logo para ir a inicio
    homeLink.addEventListener('click', (e) => {
        e.preventDefault();
        loadPage('home');
        window.history.pushState({ page: 'home' }, '', '#');
    });

    // Cargar contenido dinámicamente con transiciones
    async function loadPage(page) {
        try {
            // Cargar el contenido
            const response = await fetch(`${page}.html`);
            if (!response.ok) throw new Error('Página no encontrada');
            const content = await response.text();
            mainContent.innerHTML = content;
            
            // Manejar página rifa con animación especial
            if (page === 'rifa') {
                await handleRifaAnimation();
            } else {
                const mainLogo = document.querySelector('.main-logo');
                if (mainLogo) {
                    mainLogo.classList.remove('logo-animate-up');
                }
            }
            
            window.scrollTo(0, 0);
        } catch (error) {
            mainContent.innerHTML = '<p>Error al cargar la página.</p>';
            console.error(error);
        }
    }

    // Rifa: la entrada visual la controla rifa.js (splash + transición 1.5s al terminar la carga).
    async function handleRifaAnimation() {
        await loadRifaScript();
    }

    function liberarRifaSplashConError(textoPlano) {
        const app = document.querySelector('#rifa-app');
        if (app) {
            app.classList.remove('rifa-booting');
            app.classList.add('rifa-ready', 'rifa-init-error');
        }
        const splash = document.getElementById('rifa-splash');
        if (splash) {
            splash.setAttribute('aria-busy', 'false');
            splash.replaceChildren();
            const p = document.createElement('p');
            p.className = 'rifa-splash-error-text';
            p.textContent = textoPlano;
            splash.appendChild(p);
        }
    }

    // Cargar el script de rifa dinámicamente
    function loadRifaScript() {
        return new Promise((resolve) => {
            // Remover script anterior si existe
            const oldScript = document.getElementById('rifa-script');
            if (oldScript) oldScript.remove();

            // Crear y cargar el nuevo script
            const script = document.createElement('script');
            script.id = 'rifa-script';
            script.src = 'assets/rifa.js';  // rifa.js sigue en assets/
            script.onload = () => {
                // El IIFE ya no arranca solo: aquí invocamos init tras definirse el módulo.
                if (typeof window.initRifaApp === 'function') {
                    window.initRifaApp();
                } else {
                    console.error('initRifaApp no está definida en rifa.js');
                    liberarRifaSplashConError(
                        'No se pudo inicializar la rifa (initRifaApp). Revisa la consola (F12).'
                    );
                    const el = document.querySelector('#rifa-app #loading-indicator');
                    if (el) {
                        el.innerHTML =
                            '<p class="error-message">No se pudo inicializar la rifa (initRifaApp). Revisa la consola.</p>';
                    }
                }
                resolve();
            };
            script.onerror = () => {
                console.error('Error cargando rifa.js');
                liberarRifaSplashConError(
                    'No se pudo cargar assets/rifa.js. Revisa la ruta del sitio y la consola (F12).'
                );
                const el = document.querySelector('#rifa-app #loading-indicator');
                if (el) {
                    el.innerHTML =
                        '<p class="error-message">No se pudo cargar <code>assets/rifa.js</code>. Revisa la ruta del sitio y la consola (F12).</p>';
                }
                resolve();
            };
            document.body.appendChild(script);
        });
    }

    // Manejar clicks en los links de navegación
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            
            // Ignorar links externos o sin href
            if (!href || href.startsWith('http') || href === '#') {
                e.preventDefault();
                return;
            }

            e.preventDefault();
            
            // Extraer el nombre de la página del href o data-app
            let page = link.getAttribute('data-app') || href.substring(1);
            
            // Si es un link directo, usar el texto del link
            if (!page || page === 'soluciones' || page === 'trayectoria') {
                page = href.substring(1);
            }

            // Cerrar menú desplegable si está abierto
            dropdownMenu.classList.remove('show');

            // Cargar la página
            loadPage(page);

            // Actualizar la URL sin recargar
            window.history.pushState({ page }, '', `#${page}`);
        });
    });

    // Manejar navegación hacia atrás/adelante
    window.addEventListener('popstate', (e) => {
        const page = e.state?.page || 'home';
        loadPage(page);
    });

    // Cargar página inicial basada en la URL
    const initialPage = window.location.hash.substring(1) || 'home';
    loadPage(initialPage);
});