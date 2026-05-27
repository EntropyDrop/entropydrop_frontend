let isAlerting = false;

const originalFetch = window.fetch;

window.fetch = async (...args) => {
    // Get request URL
    let url = '';
    if (typeof args[0] === 'string') {
        url = args[0];
    } else if (args[0] && typeof args[0] === 'object' && 'url' in args[0]) {
        url = (args[0] as any).url;
    }

    // Check if it is a backend API request
    const isApiRequest = url && (
        url.includes(':8000/api') ||
        url.includes('127.0.0.1:8000/api') ||
        url.includes('/api/')
    );

    try {
        const response = await originalFetch(...args);

        if (!response.ok && isApiRequest) {
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
        if (isApiRequest) {
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
