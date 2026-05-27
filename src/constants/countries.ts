export interface Country {
    code: string;
    name: string;
    zhName: string;
    prefix: string;
}

export const countries: Country[] = [
    { code: 'CN', name: 'China', zhName: '中国', prefix: '+86' },
    { code: 'US', name: 'United States', zhName: '美国', prefix: '+1' },
    { code: 'CA', name: 'Canada', zhName: '加拿大', prefix: '+1' },
    { code: 'GB', name: 'United Kingdom', zhName: '英国', prefix: '+44' },
    { code: 'AU', name: 'Australia', zhName: '澳大利亚', prefix: '+61' },
    { code: 'DE', name: 'Germany', zhName: '德国', prefix: '+49' },
    { code: 'FR', name: 'France', zhName: '法国', prefix: '+33' },
    { code: 'JP', name: 'Japan', zhName: '日本', prefix: '+81' },
    { code: 'KR', name: 'South Korea', zhName: '韩国', prefix: '+82' },
    { code: 'SG', name: 'Singapore', zhName: '新加坡', prefix: '+65' },
    { code: 'MY', name: 'Malaysia', zhName: '马来西亚', prefix: '+60' },
    { code: 'RU', name: 'Russia', zhName: '俄罗斯', prefix: '+7' },
];
