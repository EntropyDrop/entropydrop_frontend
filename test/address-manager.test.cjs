const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
// React's input support detection needs a document before react-dom loads.
const initialDOM = new JSDOM('<div></div>');
global.window = initialDOM.window; global.document = initialDOM.window.document;
const React = require('react');
const { createRoot } = require('react-dom/client');
const compiled = build({
    stdin: { contents: `export { AddressManager } from './src/components/AddressManager'; export * from './src/constants/countries'; export * from './src/constants/shippingAddress'; export { default as en } from './src/constants/locales/en'; export { default as zh } from './src/constants/locales/zh-hans';`, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', '@iconify/react'],
    plugins: [{ name: 'address-api', setup(build) { build.onResolve({ filter: /\/utils\/api$/ }, args => ({ path: args.path, external: true })); } }],
}).then(result => result.outputFiles[0].text);

async function fixture(options, check) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    dom.window.HTMLElement.prototype.scrollIntoView = function () {};
    const requests = [], alerts = [], selected = [];
    let addresses = options.addresses || [];
    const module = { exports: {} };
    vm.runInNewContext(await compiled, { module, exports: module.exports, console, document, window: dom.window, alert: text => alerts.push(text), confirm: () => false,
        require(name) {
            if (name === '@iconify/react') return { Icon: () => null };
            if (name.endsWith('/utils/api')) return { apiFetch: async (url, init = {}) => {
                requests.push({ url, ...init });
                if (options.saveError && ['POST', 'PUT'].includes(init.method)) return { ok: false, json: async () => ({ detail: options.saveError }) };
                if (init.method === 'POST') addresses = [...addresses, { id: 'saved', ...JSON.parse(init.body) }];
                if (init.method === 'PUT') addresses = addresses.map(address => address.id === url.split('/').at(-1) ? { ...address, ...JSON.parse(init.body) } : address);
                return { ok: true, json: async () => addresses };
            } };
            return require(name);
        },
    });
    const root = createRoot(document.getElementById('root'));
    const current = module.exports[options.lang || 'en'];
    const button = text => Array.from(document.querySelectorAll('button')).find(button => button.textContent === text || button.getAttribute('aria-label') === text);
    const click = element => React.act(async () => { assert.ok(element); element.click(); });
    const field = name => document.querySelector(`[name="${name}"]`);
    const input = (element, value) => React.act(async () => {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, value);
        element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
    const countryInput = () => document.getElementById('shipping-country');
    const filterCountry = async query => {
        await click(countryInput());
        await input(countryInput(), query);
    };
    const fill = async (name, value) => {
        if (name === 'country') {
            await filterCountry(value);
            await click(document.querySelector(`[role="option"][data-country-code="${value}"]`));
        } else await input(field(name), value);
    };
    const key = key => React.act(async () => {
        countryInput().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
    try {
        await React.act(async () => root.render(React.createElement(module.exports.AddressManager, { isOpen: true, current, onClose() {}, onSelect: options.selectable ? address => selected.push(address) : undefined })));
        await check({ ...module.exports, current, requests, alerts, selected, field, fill, filterCountry, countryInput, key, button, click, add: async () => { await click(button(current.address.addNew)); await fill('recipient_name', 'Alex Example'); }, save: () => click(button(current.address.save)) });
    } finally {
        await React.act(() => root.unmount());
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
}

for (const lang of ['en', 'zh']) test(`${lang}: country or region selection supplies the matching phone prefix and preserves typed digits`, async () => fixture({ lang }, async e => {
    await e.add();
    assert.equal(document.querySelector('label[for="shipping-country"]').textContent, lang === 'en' ? 'Country or region *' : '国家或地区 *');
    await e.click(e.countryInput());
    assert.equal(document.querySelectorAll('[role="option"]').length, 252);
    await e.key('Escape');
    assert.equal(e.field('phone_prefix').value, '+86');
    await e.fill('phone', '5550100');
    for (const [country, prefix] of [['HK', '+852'], ['MO', '+853'], ['TW', '+886'], ['IN', '+91'], ['AE', '+971'], ['BS', '+1'], ['US', '+1'], ['CA', '+1'], ['XK', '+383'], ['VA', '+39'], ['BQ', '+599'], ['CW', '+599'], ['SJ', '+47']]) {
        await e.fill('country', country);
        assert.equal(e.field('phone_prefix').value, prefix);
        assert.equal(e.field('phone').value, '5550100');
    }
    const prefixes = Array.from(e.field('phone_prefix').options).map(option => option.value);
    assert.equal(new Set(prefixes).size, prefixes.length, 'shared calling codes have one option');
}));

test('address fields flow from region to street and postal code before phone, and preserve alphanumeric postal codes', async () => fixture({}, async e => {
    await e.add();
    assert.deepEqual(Array.from(document.querySelector('form').elements).map(element => element.name).filter(Boolean), ['recipient_name', 'country', 'state', 'city', 'detail_address', 'zip_code', 'phone_prefix', 'phone']);
    await e.fill('country', 'GB'); await e.fill('city', 'London'); await e.fill('detail_address', 'Example test address');
    await e.fill('zip_code', 'SW1A 1AA'); await e.fill('phone', '7700900123');
    await e.save();
    assert.equal(e.alerts.length, 0);
    const post = e.requests.find(request => request.method === 'POST');
    assert.ok(post);
    assert.deepEqual(JSON.parse(post.body), { recipient_name: 'Alex Example', country: 'GB', state: '', city: 'London', detail_address: 'Example test address', zip_code: 'SW1A 1AA', phone: '+44 7700900123', is_default: false });
}));

const baseAddress = { id: 'saved-address', recipient_name: 'Alex Example', country: 'BS', state: '', city: 'Nassau', detail_address: 'Example address', zip_code: '', is_default: false };
for (const [phone, prefix, number] of [['+12425550100', '+1', '2425550100'], ['+1242 5550100', '+1242', '5550100'], ['+1 2425550100', '+1', '2425550100'], ['+44 7700900123', '+44', '7700900123']]) {
    test(`editing ${phone} preserves the original contact rather than truncating overlapping prefixes`, async () => fixture({ addresses: [{ ...baseAddress, phone }] }, async e => {
        await e.click(e.button(e.current.address.editAddress));
        assert.equal(e.field('phone_prefix').value, prefix);
        assert.equal(e.field('phone').value, number);
        await e.save();
        assert.equal(JSON.parse(e.requests.find(request => request.method === 'PUT').body).phone, `${prefix} ${number}`);
    }));
}

test('a pasted international phone is not saved with a duplicate automatic prefix', async () => fixture({}, async e => {
    await e.add(); await e.fill('country', 'HK'); await e.fill('state', 'Kowloon'); await e.fill('city', 'Hong Kong'); await e.fill('detail_address', 'Example test address');
    await e.fill('phone', '+44 7700900123'); await e.save();
    assert.equal(JSON.parse(e.requests.find(request => request.method === 'POST').body).phone, '+44 7700900123');
}));

test('manually selecting a different contact prefix is saved, while Cancel creates no address', async () => fixture({}, async e => {
    await e.add(); await e.fill('country', 'HK'); await e.fill('phone_prefix', '+86');
    await e.fill('state', 'Kowloon'); await e.fill('city', 'Hong Kong'); await e.fill('detail_address', 'Example test address'); await e.fill('phone', '13800000000');
    await e.save();
    assert.equal(JSON.parse(e.requests.find(request => request.method === 'POST').body).phone, '+86 13800000000');
    await e.add(); await e.click(e.button(e.current.modal.cancel));
    assert.equal(e.requests.filter(request => request.method === 'POST').length, 1);
}));

test('the complete country and region catalog retains unique codes and nonempty localized labels', async () => fixture({}, async e => {
    assert.equal(e.countries.length, 252);
    assert.equal(new Set(e.countries.map(item => item.code)).size, e.countries.length);
    assert.ok(e.countries.every(item => item.name && item.zhName && /^\+\d+$/.test(item.prefix)));
    assert.equal(e.countries.find(item => item.code === 'DO').prefix, '+1');
    assert.equal(e.countries.find(item => item.code === 'PR').prefix, '+1');
    assert.match(e.countries.find(item => item.code === 'BQ').name, /Caribbean|Saba/);
}));


for (const lang of ['en', 'zh']) test(`${lang}: required fields follow the destination and optional labels are absent`, async () => fixture({ lang }, async e => {
    await e.add();
    assert.equal(e.field('state').required, true);
    assert.equal(e.field('zip_code').required, true);
    assert.doesNotMatch(document.querySelector('form').textContent, /optional|选填/);
    await e.fill('country', 'US');
    assert.equal(e.field('state').tagName, 'SELECT');
    assert.ok([...e.field('state').options].some(option => option.value === 'CA'));
    await e.fill('state', 'CA'); await e.fill('zip_code', '95131');
    await e.fill('country', 'GB');
    assert.equal(e.field('state').required, false);
    assert.equal(e.field('zip_code').required, true);
    assert.equal(e.field('state').value, '');
    assert.equal(e.field('zip_code').value, '');
    await e.fill('country', 'HK');
    assert.equal(e.field('zip_code'), null);
    assert.equal(e.field('state').required, true);
    await e.fill('country', 'SG');
    assert.equal(e.field('state'), null);
    assert.equal(e.field('city').required, false);
    assert.equal(e.field('zip_code').required, true);
}));

test('missing state or malformed postal code is shown inline and blocks saving', async () => fixture({}, async e => {
    await e.add(); await e.fill('country', 'US'); await e.fill('city', 'San Jose');
    await e.fill('detail_address', '2211 N First Street'); await e.fill('phone', '5550100');
    await e.fill('zip_code', 'abc'); await e.save();
    assert.equal(e.requests.filter(request => request.method === 'POST').length, 0);
    assert.equal(e.field('state').getAttribute('aria-invalid'), 'true');
    assert.equal(e.field('zip_code').getAttribute('aria-invalid'), 'true');
    assert.match(document.getElementById('shipping-error-zip_code').textContent, /95014/);
    await e.fill('state', 'CA'); await e.fill('zip_code', '95131'); await e.save();
    const post = e.requests.find(request => request.method === 'POST');
    assert.equal(JSON.parse(post.body).state, 'CA');
    assert.equal(post.skipGlobalError, true);
}));

test('postal codes are normalized without discarding spaces or letters', async () => fixture({}, async e => {
    await e.add(); await e.fill('country', 'CA'); await e.fill('state', 'ON'); await e.fill('city', 'Ottawa');
    await e.fill('detail_address', 'Example address'); await e.fill('zip_code', 'k1a 0b1'); await e.fill('phone', '5550100');
    await e.save();
    assert.equal(JSON.parse(e.requests.find(request => request.method === 'POST').body).zip_code, 'K1A 0B1');
}));

test('editing an existing full state name uses the postal abbreviation', async () => fixture({ addresses: [{ ...baseAddress, country: 'US', state: 'California', city: 'San Jose', zip_code: '95131', phone: '+1 5550100' }] }, async e => {
    await e.click(e.button(e.current.address.editAddress));
    assert.equal(e.field('state').value, 'CA');
    await e.save();
    assert.equal(JSON.parse(e.requests.find(request => request.method === 'PUT').body).state, 'CA');
}));

test('all bundled postal patterns recognize at least their first documented example', async () => fixture({}, async e => {
    for (const country of e.countries) {
        const rule = e.addressRule(country.code);
        assert.ok(rule, country.code);
        if (rule.postal_pattern && rule.postal_example) {
            assert.ok(new RegExp(`^(?:${rule.postal_pattern})$`, 'i').test(rule.postal_example), country.code);
        }
    }
    const fields = { recipient_name: '测试收件人', country: 'CN', state: '北京市', city: '北京市', zip_code: '100000', detail_address: '测试地址', phone: '+86 13800000000' };
    assert.equal(Object.keys(e.validateAddress(fields)).length, 0);
    assert.equal(e.validateAddress({ ...fields, country: 'ZZ' }).country, 'country_invalid');
    assert.equal(e.validateAddress({ ...fields, detail_address: 'a'.repeat(601) }).detail_address, 'street_length');
}));


test('selecting an incomplete legacy address opens correction instead of passing it to checkout', async () => fixture({ selectable: true, addresses: [{ ...baseAddress, country: 'US', state: '', city: 'San Jose', zip_code: '', phone: '+1 5550100' }] }, async e => {
    const street = [...document.querySelectorAll('div')].find(element => element.textContent === baseAddress.detail_address);
    await e.click(street);
    assert.equal(e.selected.length, 0);
    assert.equal(e.field('state').getAttribute('aria-invalid'), 'true');
    assert.equal(e.field('zip_code').getAttribute('aria-invalid'), 'true');
    await e.fill('state', 'CA'); await e.fill('zip_code', '95131'); await e.save();
    const savedStreet = [...document.querySelectorAll('div')].find(element => element.textContent === baseAddress.detail_address);
    await e.click(savedStreet);
    assert.equal(e.selected.length, 1);
    assert.equal(e.selected[0].state, 'CA');
}));

test('server field errors remain in the form without a global error popup', async () => fixture({ saveError: { code: 'invalid_shipping_address', fields: { zip_code: 'postal_format' } } }, async e => {
    await e.add(); await e.fill('country', 'GB'); await e.fill('city', 'London');
    await e.fill('detail_address', 'Example address'); await e.fill('zip_code', 'SW1A 1AA'); await e.fill('phone', '7700900123'); await e.save();
    assert.equal(e.field('zip_code').getAttribute('aria-invalid'), 'true');
    assert.equal(e.alerts.length, 0);
}));

for (const lang of ['en', 'zh']) test(`${lang}: countries filter by English, Chinese and country code while keeping alphabetical order`, async () => fixture({ lang }, async e => {
    await e.add();
    for (const [query, codes] of [['united states', ['US']], ['美国', ['UM', 'US']], [' hk ', ['HK']], ['aland islands', ['AX']]]) {
        await e.filterCountry(query);
        assert.deepEqual([...document.querySelectorAll('[role="option"]')].map(option => option.dataset.countryCode), codes);
        assert.equal(e.field('country').value, 'CN', 'filtering alone must not change the saved country');
    }
    await e.filterCountry('united');
    assert.deepEqual([...document.querySelectorAll('[role="option"]')].map(option => option.dataset.countryCode), ['AE', 'GB', 'US']);
    await e.fill('country', 'US');
    assert.equal(e.countryInput().value, lang === 'en' ? 'United States' : '美国');
    assert.equal(e.field('phone_prefix').value, '+1');
    assert.equal(document.querySelector('[role="listbox"]'), null);
}));

test('country keyboard navigation selects a result without submitting the address form', async () => fixture({}, async e => {
    await e.add();
    await e.filterCountry('united');
    await e.key('ArrowDown');
    const active = document.getElementById(e.countryInput().getAttribute('aria-activedescendant'));
    assert.equal(active.dataset.countryCode, 'GB');
    await e.key('Enter');
    assert.equal(e.field('country').value, 'GB');
    assert.equal(e.field('phone_prefix').value, '+44');
    assert.equal(e.countryInput().getAttribute('aria-expanded'), 'false');
    assert.equal(e.requests.some(request => request.method === 'POST'), false);
}));

test('unmatched searches, Escape, Tab and outside clicks preserve the selected country', async () => fixture({}, async e => {
    await e.add();
    await e.filterCountry('no-such-country');
    assert.ok(document.body.textContent.includes(e.current.address.noMatchingCountries));
    assert.equal(document.querySelectorAll('[role="option"]').length, 0);
    await e.key('Enter');
    assert.equal(e.field('country').value, 'CN');
    await e.key('Escape');
    assert.equal(e.countryInput().value, 'China');
    await e.filterCountry('Japan'); await e.key('Tab');
    assert.equal(e.countryInput().value, 'China');
    await e.filterCountry('Japan');
    await React.act(async () => document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true })));
    assert.equal(document.querySelector('[role="listbox"]'), null);
    assert.equal(e.field('country').value, 'CN');
    assert.equal(e.field('phone_prefix').value, '+86');
}));

test('reselecting the same country preserves the rest of the address', async () => fixture({}, async e => {
    await e.add();
    await e.fill('state', 'Beijing'); await e.fill('zip_code', '100000');
    await e.fill('country', 'CN');
    assert.equal(e.field('state').value, 'Beijing');
    assert.equal(e.field('zip_code').value, '100000');
}));

test('recipient is required, preserves Unicode and follows the PayPal 300-character limit', async () => fixture({}, async e => {
    await e.add();
    assert.equal(e.field('recipient_name').required, true);
    assert.equal(e.field('recipient_name').maxLength, 300);
    assert.equal(e.field('recipient_name').autocomplete, 'shipping name');
    await e.fill('country', 'GB'); await e.fill('city', 'London'); await e.fill('detail_address', 'Example address');
    await e.fill('zip_code', 'SW1A 1AA'); await e.fill('phone', '7700900123');
    for (const value of ['  ', '名'.repeat(301)]) {
        await e.fill('recipient_name', value); await e.save();
        assert.equal(e.requests.some(request => request.method === 'POST'), false);
        assert.equal(e.field('recipient_name').getAttribute('aria-invalid'), 'true');
    }
    await e.fill('recipient_name', '  王小明 José O’Neil  '); await e.save();
    assert.equal(JSON.parse(e.requests.find(request => request.method === 'POST').body).recipient_name, '王小明 José O’Neil');
}));

test('an old address without a recipient requires correction before selection', async () => fixture({ selectable: true, addresses: [{ ...baseAddress, recipient_name: '', phone: '+1 2425550100' }] }, async e => {
    await e.click([...document.querySelectorAll('div')].find(element => element.textContent === baseAddress.detail_address));
    assert.equal(e.selected.length, 0);
    assert.equal(e.field('recipient_name').getAttribute('aria-invalid'), 'true');
    await e.fill('recipient_name', 'Recipient Example'); await e.save();
    await e.click([...document.querySelectorAll('div')].find(element => element.textContent === baseAddress.detail_address));
    assert.equal(e.selected[0].recipient_name, 'Recipient Example');
}));
