let isAlerting = false;

const originalFetch = window.fetch;

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
            if (response.status === 401) {
                if (!isAlerting) {
                    isAlerting = true;
                    localStorage.removeItem('token');
                    const isZh = navigator.language.toLowerCase().startsWith('zh');
                    alert(isZh ? '登录已过期，请重新登录。' : 'Session expired, please log in again.');
                    window.location.reload();
                }
            } else {
                // General error handling
                try {
                    const clone = response.clone();
                    const data = await clone.json();
                    const message = data.detail || `请求失败 (${response.status})`;
                    const isZh = navigator.language.toLowerCase().startsWith('zh');
                    window.dispatchEvent(new CustomEvent('global-error', {
                        detail: {
                            message,
                            title: isZh ? '请求错误' : 'Request Error'
                        }
                    }));
                } catch (e) {
                    const isZh = navigator.language.toLowerCase().startsWith('zh');
                    window.dispatchEvent(new CustomEvent('global-error', {
                        detail: {
                            message: `请求失败 (${response.status})`,
                            title: isZh ? '请求错误' : 'Request Error'
                        }
                    }));
                }
            }
        }

        return response;
    } catch (error: any) {
        if (isApiRequest && !skipGlobalError) {
            const isZh = navigator.language.toLowerCase().startsWith('zh');
            window.dispatchEvent(new CustomEvent('global-error', {
                detail: {
                    message: error.message || '网络连接失败',
                    title: isZh ? '网络错误' : 'Network Error'
                }
            }));
        }
        throw error; // Re-throw the error without breaking the native call chain
    }
};

export { };
