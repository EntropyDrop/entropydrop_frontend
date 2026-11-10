const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');

const root = path.resolve(__dirname, '..');
const compiled = build({
    stdin: { contents: `export { createElement } from 'react';
        export { renderToStaticMarkup } from 'react-dom/server';
        export { MemoryRouter } from 'react-router-dom';
        export { TermsOfServicePage } from './src/pages/TermsOfServicePage';
        export { ShippingRefundPolicyPage } from './src/pages/ShippingRefundPolicyPage';
        export { default as en } from './src/constants/locales/en';
        export { default as zh } from './src/constants/locales/zh-hans';
        export { FIGURE_PRINT_TERMS } from './src/constants/figurePrintTerms';`,
        resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
}).then(result => {
    const module = { exports: {} };
    new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, require);
    return module.exports;
});

for (const [lang, pick] of [['en', m => m.en], ['zh', m => m.zh]]) {
    test(`${lang}: the Terms of Service contain the 3D printing section without a separate agreement step`, async () => {
        const m = await compiled; const current = pick(m);
        const html = m.renderToStaticMarkup(m.createElement(m.MemoryRouter, { initialEntries: ['/skin/tos'] },
            m.createElement(m.TermsOfServicePage, { current })));
        assert.ok(html.includes(`id="${m.FIGURE_PRINT_TERMS.anchor}"`));
        assert.ok(html.includes(current.figurePrintTerms.sectionTitle));
        for (const section of current.figurePrintTerms.sections) assert.ok(html.includes(section.title));
        assert.equal(html.includes('type="checkbox"'), false);
        const license = current.termsOfService.sections.find(section => /^6\./.test(section.title));
        assert.match(license.content, lang === 'en' ? /digital commercial license/ : /数字商用许可/);
        assert.match(current.figurePrintTerms.sections[1].content, lang === 'en' ? /digital commercial license/ : /数字商用许可/);
    });
}

test('the old standalone terms URL stays routed and redirects to the Terms of Service section', () => {
    const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
    assert.match(app, /<Route path=\{FIGURE_PRINT_TERMS\.legacyPath\} element=\{<FigurePrintTermsPage \/>\} \/>/);
    const redirect = fs.readFileSync(path.join(root, 'src/pages/FigurePrintTermsPage.tsx'), 'utf8');
    assert.match(redirect, /<Navigate to=\{FIGURE_PRINT_TERMS\.path\} replace \/>/);
});

for (const [lang, pick] of [['en', m => m.en], ['zh', m => m.zh]]) {
    test(`${lang}: the shipping, returns and refunds policy covers the payment-processor requirements`, async () => {
        const m = await compiled; const current = pick(m);
        const html = m.renderToStaticMarkup(m.createElement(m.MemoryRouter, { initialEntries: ['/skin/refund-policy'] },
            m.createElement(m.ShippingRefundPolicyPage, { current })));
        const policy = current.shippingRefundPolicy;
        assert.equal(policy.sections.length, 11);
        for (const section of policy.sections) assert.ok(html.includes(section.title));
        const text = policy.sections.map(section => section.content).join('\n');
        for (const required of ['support@entropydrop.com', 'USD', '14', 'Stripe', 'PayPal']) assert.ok(text.includes(required), required);
        for (const country of lang === 'en' ? ['Cuba', 'Iran', 'North Korea', 'Syria', 'Crimea', 'Donetsk', 'Luhansk'] : ['古巴', '伊朗', '朝鲜', '叙利亚', '克里米亚', '顿涅茨克', '卢甘斯克']) {
            assert.ok(text.includes(country), country);
        }
        assert.match(policy.sections.at(-1).content, /Wyoming|怀俄明/);
    });

    test(`${lang}: the Terms of Service point to the policy and no longer assume a checkout confirmation`, async () => {
        const m = await compiled; const current = pick(m);
        const tos = current.termsOfService.sections.map(section => section.content).join('\n');
        assert.ok(tos.includes('entropydrop.com/skin/refund-policy'));
        assert.doesNotMatch(tos, /separately confirmed by you|由您单独确认|七日无理由/);
        assert.match(current.termsOfService.sections.find(section => /^12\./.test(section.title)).content, /Stripe/);
        const privacy = current.privacyPolicy.sections.map(section => section.content).join('\n');
        assert.match(privacy, /Stripe/);
        assert.match(privacy, lang === 'en' ? /do not receive or store full card numbers/ : /不接收也不保存完整银行卡号/);
        assert.doesNotMatch(privacy, lang === 'en' ? /download agreement records/ : /下载协议历史记录/);
        assert.ok(current.figurePrint.commissionOrder.policyNote && current.figurePrint.commissionOrder.policyLink);
    });
}

test('the policy page is routed, linked from the footer and the checkout dialog, and shown as a policy page', () => {
    const read = file => fs.readFileSync(path.join(root, file), 'utf8');
    const app = read('src/App.tsx');
    assert.match(app, /<Route path="\/skin\/refund-policy" element=\{<ShippingRefundPolicyPage /);
    assert.match(app, /\['\/skin\/privacy', '\/skin\/tos', '\/skin\/refund-policy'/);
    assert.match(read('src/components/Footer.tsx'), /to="\/skin\/refund-policy"[\s\S]*data\.links\.refundPolicy/);
    assert.match(read('src/pages/figure/print/FigureCommissionDialog.tsx'), /href="\/skin\/refund-policy"/);
    for (const file of ['src/components/Footer.tsx', 'src/pages/PrivacyPolicyPage.tsx', 'src/pages/TermsOfServicePage.tsx', 'src/pages/ShippingRefundPolicyPage.tsx']) {
        assert.match(read(file), /EntropyDrop LLC/, file);
    }
});

test('the restricted countries named in the policy cannot be selected as shipping destinations', () => {
    const rules = JSON.parse(fs.readFileSync(path.join(root, 'src/constants/shipping-address-rules.json'), 'utf8'));
    assert.deepEqual(rules.unsupported_countries, ['CU', 'IR', 'KP', 'SY']);
    for (const code of rules.unsupported_countries) assert.equal(rules.countries[code], undefined, code);
});

for (const [lang, pick] of [['en', m => m.en], ['zh', m => m.zh]]) {
    test(`${lang}: the not-an-official-Minecraft-product disclaimer is shown wherever the service and its products are presented`, async () => {
        const m = await compiled; const current = pick(m);
        const disclaimer = lang === 'en' ? /NOT AN OFFICIAL MINECRAFT PRODUCT\. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT\./ : /非官方 Minecraft 产品，未获 Mojang 或 Microsoft 批准，亦与其无关联。/;
        const section = (title) => current.termsOfService.sections.find(item => title.test(item.title)).content;
        for (const text of [current.home.footer.disclaimer, current.figurePrint.commissionOrder.disclaimer,
            section(/^1\./), section(/^11\./), current.shippingRefundPolicy.sections.at(-1).content]) assert.match(text, disclaimer);
        assert.match(section(/^11\./), lang === 'en' ? /seller and manufacturer/ : /销售方和制造方/);
        assert.match(section(/^11\./), lang === 'en' ? /original works or works you are authorized to use\. EntropyDrop does not provide official Minecraft characters/ : /原创作品或您有权使用的作品制作。EntropyDrop 不提供官方 Minecraft 角色/);
        assert.doesNotMatch(current.figurePrint.commissionOrder.disclaimer + current.figurePrint.commissionOrder.policyNote, /official Minecraft characters|官方 Minecraft 角色/);
        const read = file => fs.readFileSync(path.join(root, file), 'utf8');
        assert.match(read('src/components/Footer.tsx'), /data\.disclaimer/);
        assert.doesNotMatch(read('src/pages/PublicPage.tsx') + JSON.stringify(current.public_page.introduction), /disclaimer|MINECRAFT|Minecraft|Mojang/);
        assert.match(read('src/pages/figure/print/FigureCommissionDialog.tsx'), /t\.disclaimer/);
    });

    test(`${lang}: the terms and privacy policy describe manual creator withdrawals through Stripe`, async () => {
        const m = await compiled; const current = pick(m);
        const earnings = current.termsOfService.sections.find(item => /^5\./.test(item.title));
        assert.match(earnings.title, lang === 'en' ? /Creator Earnings/ : /创作者佣金/);
        assert.match(earnings.content, lang === 'en' ? /within 5 days[^.]*Stripe\. The Stripe fee is deducted from the amount you request/ : /5 天内处理申请，并通过 Stripe 转账。Stripe 手续费从您申请的金额中扣除/);
        const privacy = current.privacyPolicy.sections.map(item => item.content).join('\n');
        assert.match(privacy, lang === 'en' ? /Creator program data[^;]*Stripe transfer receipt|transfer receipt/ : /创作者计划[^；]*转账回执/);
        for (const text of [earnings.content, privacy]) assert.doesNotMatch(text, /PayPal Payouts|PayPal 提现/);
    });
}
