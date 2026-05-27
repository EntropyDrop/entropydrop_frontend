export const showAlert = (message: string, title: string = '') => {
    const isZh = navigator.language.toLowerCase().startsWith('zh');
    const defaultTitle = title || (isZh ? '提示' : 'Notice');
    window.dispatchEvent(new CustomEvent('global-error', { 
        detail: { message, title: defaultTitle } 
    }));
};

export const showError = (message: string, title: string = '') => {
    const isZh = navigator.language.toLowerCase().startsWith('zh');
    const defaultTitle = title || (isZh ? '错误' : 'Error');
    window.dispatchEvent(new CustomEvent('global-error', { 
        detail: { message, title: defaultTitle } 
    }));
};
