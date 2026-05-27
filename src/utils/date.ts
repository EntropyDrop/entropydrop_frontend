export const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
        // If the date string doesn't have a timezone indicator, treat it as UTC
        const normalized = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
        const date = new Date(normalized);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateStr;
    }
}
