"""Generate the bundled rules from a pinned libaddressinput countryinfo.txt.

Usage: python3 scripts/generate-shipping-address-rules.py /path/to/countryinfo.txt
The backend ships the same JSON as data/shipping-address-rules.json.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '5ef3a927bdd6002bf25c5c09029347bebf57a57b'
rows = dict(line.split('=', 1) for line in Path(sys.argv[1]).read_text().splitlines())
codes = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {countries} from 'countries-list'; console.log(JSON.stringify(Object.keys(countries)))",
], cwd=ROOT))
defaults = json.loads(rows['data/ZZ'])
paypal_state_required = {'AR', 'BR', 'CN', 'CA', 'IN', 'ID', 'JP', 'MX', 'TH', 'US'}
rules = {}
for code in sorted(codes):
    data = json.loads(rows['data/' + code])
    fmt, required = data.get('fmt', defaults['fmt']), data.get('require', defaults['require'])
    postal_pattern = data.get('zip', '').replace('\\\\', '\\')
    rule = {
        'state_required': code in paypal_state_required or 'S' in required,
        'state_visible': '%S' in fmt or code in paypal_state_required,
        'city_required': 'C' in required,
        # PayPal calls postal codes typically required where a postal system exists.
        # Collect one whenever the referenced metadata defines its format.
        'postal_required': bool(postal_pattern) or 'Z' in required,
        'postal_visible': '%Z' in fmt or bool(postal_pattern),
        'postal_pattern': postal_pattern,
        'postal_example': next((example for example in data.get('zipex', '').split(',') if example and (not postal_pattern or re.fullmatch(postal_pattern, example, re.ASCII | re.IGNORECASE))), ''),
        'paypal_country_code': 'C2' if code == 'CN' else code,
    }
    # Use postal abbreviations for these countries, as required by PayPal's
    # admin_area_1 format (e.g. CA, not California). Other regions retain text.
    if code in {'US', 'CA', 'AU'}:
        rule['states'] = dict(zip(data['sub_keys'].split('~'), data['sub_names'].split('~')))
    rules[code] = rule
payload = {
    'version': '2026-10-10',
    'sources': [
        'https://developer.paypal.com/sdk/orders/v2/definitions/order_request',
        'https://developer.paypal.com/api/orders/v2/definitions/purchase_unit',
        'https://github.com/google/libaddressinput/wiki/AddressValidationMetadata',
        f'https://github.com/google/libaddressinput/blob/{COMMIT}/testdata/countryinfo.txt',
    ],
    'limits': {'recipient_name': 300, 'country': 2, 'state': 100, 'city': 100, 'zip_code': 20, 'phone': 50, 'detail_address': 600},
    'countries': rules,
}
output = ROOT / 'src/constants/shipping-address-rules.json'
output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
print(f'Generated {len(rules)} country/region rules')
