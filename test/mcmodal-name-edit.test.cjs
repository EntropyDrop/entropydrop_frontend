const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

test('MCModal: owner skin name edit button is always visible and not hidden by opacity-0', () => {
    const modalCode = fs.readFileSync(path.resolve(__dirname, '../src/components/MCModal.tsx'), 'utf8');

    // Verify isOwner includes creator id and user_id checks
    assert.match(modalCode, /const isOwner = Boolean\([\s\S]*?item\.creator\?\.id[\s\S]*?currentUser\.id/, 'isOwner checks current user against creator');

    // Verify renderEditableName renders the edit button without opacity-0 / group-hover hiding
    assert.doesNotMatch(modalCode, /opacity-0 group-hover\/name:opacity-60/, 'Edit button should not be hidden behind group-hover or opacity-0');
    assert.match(modalCode, /title=\{current\.mcmodal\.editName\}[\s\S]*?<Icon icon="pixelarticons:edit"/, 'Edit button renders edit icon with title');
});

test('z-index hierarchy: UserMenu is above MCModal, and MCModal is above Navbar', () => {
    const layoutCode = fs.readFileSync(path.resolve(__dirname, '../src/components/Layout.tsx'), 'utf8');
    const userMenuCode = fs.readFileSync(path.resolve(__dirname, '../src/components/UserMenu.tsx'), 'utf8');
    const mcModalCode = fs.readFileSync(path.resolve(__dirname, '../src/components/MCModal.tsx'), 'utf8');

    // Extract MCModal z-index
    const mcModalZMatch = mcModalCode.match(/fixed top-\[64px\][^"]*?z-\[(\d+)\]/);
    assert.ok(mcModalZMatch, 'MCModal must have a z-index class');
    const mcModalZ = parseInt(mcModalZMatch[1], 10);

    // Outer Top Navigation wrapper must NOT establish a stacking context with z-index
    const topNavWrapperMatch = layoutCode.match(/\{\/\*\s*Top Navigation[\s\S]*?<div className="([^"]+)"/);
    assert.ok(topNavWrapperMatch, 'Top Navigation wrapper must exist');
    assert.doesNotMatch(topNavWrapperMatch[1], /\bz-/, 'Top Navigation wrapper must not set z-index so UserMenu can stack above MCModal independently of navbar');

    // Verify all navbar parts (brand logo, first-level switcher, second-level sub-nav) sit below MCModal
    const brandLinkZMatch = layoutCode.match(/<Link\s+to="\/"\s+className=\{`[^`]*?z-\[(\d+)\]/);
    assert.ok(brandLinkZMatch, 'Navbar brand link must have a z-index class');
    const brandLinkZ = parseInt(brandLinkZMatch[1], 10);
    assert.ok(brandLinkZ < mcModalZ, `Navbar brand link z-index (${brandLinkZ}) must be lower than MCModal (${mcModalZ})`);

    const switcherZMatch = layoutCode.match(/First-Level Navigation Switcher[\s\S]*?<div className="[^"]*?z-\[(\d+)\]/);
    assert.ok(switcherZMatch, 'First-Level Navigation Switcher must have a z-index class');
    const switcherZ = parseInt(switcherZMatch[1], 10);
    assert.ok(switcherZ < mcModalZ, `First-Level Navigation Switcher z-index (${switcherZ}) must be lower than MCModal (${mcModalZ})`);

    const subNavZMatch = layoutCode.match(/Second-Level Sub-Navigation[\s\S]*?<div className="[^"]*?z-\[(\d+)\]/);
    assert.ok(subNavZMatch, 'Second-Level Sub-Navigation must have a z-index class');
    const subNavZ = parseInt(subNavZMatch[1], 10);
    assert.ok(subNavZ < mcModalZ, `Second-Level Sub-Navigation z-index (${subNavZ}) must be lower than MCModal (${mcModalZ})`);

    // Verify UserMenu root container has z-index > mcModalZ
    const userMenuRootZMatch = userMenuCode.match(/<div className="[^"]*?z-\[(\d+)\][^"]*?" ref=\{menuRef\}/);
    assert.ok(userMenuRootZMatch, 'UserMenu root container must have a z-index class');
    const userMenuRootZ = parseInt(userMenuRootZMatch[1], 10);
    assert.ok(userMenuRootZ > mcModalZ, `UserMenu root z-index (${userMenuRootZ}) must be higher than MCModal (${mcModalZ})`);

    // Verify Mailbox dropdown has z-index > mcModalZ
    const mailboxZMatch = userMenuCode.match(/isNotifOpen && \([\s\S]*?z-\[(\d+)\]/);
    assert.ok(mailboxZMatch, 'Mailbox dropdown must have a z-index class');
    const mailboxZ = parseInt(mailboxZMatch[1], 10);
    assert.ok(mailboxZ > mcModalZ, `Mailbox dropdown z-index (${mailboxZ}) must be higher than MCModal (${mcModalZ})`);

    // Verify UserMenu dropdown has z-index > mcModalZ
    const userMenuZMatch = userMenuCode.match(/isOpen && \([\s\S]*?z-\[(\d+)\]/);
    assert.ok(userMenuZMatch, 'UserMenu dropdown must have a z-index class');
    const userMenuZ = parseInt(userMenuZMatch[1], 10);
    assert.ok(userMenuZ > mcModalZ, `UserMenu dropdown z-index (${userMenuZ}) must be higher than MCModal (${mcModalZ})`);
});
