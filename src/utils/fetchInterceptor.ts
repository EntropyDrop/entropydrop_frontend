let isAlerting = false;

const originalFetch = window.fetch;

const getCurrentLocale = async () => {
    const isAuto = localStorage.getItem('isAuto') !== 'false';
    let lang = 'en';
    if (isAuto) {
        const fullLang = navigator.language.toLowerCase();
        if (fullLang.startsWith('zh')) lang = 'zh-hans';
    } else {
        const stored = localStorage.getItem('lang');
        if (stored === 'zh-hans' || stored === 'en') {
            lang = stored;
        }
    }
    return lang === 'zh-hans'
        ? (await import('../constants/locales/zh-hans')).default
        : (await import('../constants/locales/en')).default;
};

window.fetch = async (input, init) => {
    // Get request URL
    let url = '';
    if (typeof input === 'string') {
        url = input;
    } else if (input && typeof input === 'object' && 'url' in input) {
        url = (input as any).url;
    }

    // Check if it is a backend API request
    const isApiRequest = url && /\/api\b/.test(url);

    let skipGlobalError = false;
    let finalInit = init;
    if (finalInit && typeof finalInit === 'object') {
        if ('skipGlobalError' in finalInit) {
            skipGlobalError = !!(finalInit as any).skipGlobalError;
            const { skipGlobalError: _, ...restOptions } = finalInit as any;
            finalInit = restOptions;
        }
    }

    try {
        const response = await originalFetch(input, finalInit);

        if (!response.ok && isApiRequest && !skipGlobalError) {
            const locale = await getCurrentLocale();
            if (response.status === 401) {
                const token = localStorage.getItem('token');
                if (token && !isAlerting) {
                    isAlerting = true;
                    localStorage.removeItem('token');
                    alert(locale.common.sessionExpired);
                    isAlerting = false;
                    window.dispatchEvent(new Event('logout'));
                }
            } else {
                // General error handling
                try {
                    const clone = response.clone();
                    const data = await clone.json();
                    const message = data.detail || `${locale.common.requestFailed} (${response.status})`;
                    window.dispatchEvent(new CustomEvent('global-error', {
                        detail: {
                            message,
                            title: locale.common.requestError
                        }
                    }));
                } catch (e) {
                    window.dispatchEvent(new CustomEvent('global-error', {
                        detail: {
                            message: `${locale.common.requestFailed} (${response.status})`,
                            title: locale.common.requestError
                        }
                    }));
                }
            }
        }

        return response;
    } catch (error: any) {
        if (isApiRequest && !skipGlobalError) {
            const locale = await getCurrentLocale();
            window.dispatchEvent(new CustomEvent('global-error', {
                detail: {
                    message: error.message || locale.common.networkConnectFailed,
                    title: locale.common.networkError
                }
            }));
        }
        throw error; // Re-throw the error without breaking the native call chain
    }
};

export { };
