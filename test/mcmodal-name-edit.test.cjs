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

test('z-index hierarchy: UserMenu, Mailbox, and Top Navigation are higher than MCModal', () => {
    const layoutCode = fs.readFileSync(path.resolve(__dirname, '../src/components/Layout.tsx'), 'utf8');
    const userMenuCode = fs.readFileSync(path.resolve(__dirname, '../src/components/UserMenu.tsx'), 'utf8');
    const mcModalCode = fs.readFileSync(path.resolve(__dirname, '../src/components/MCModal.tsx'), 'utf8');

    // Extract z-indexes
    const mcModalZMatch = mcModalCode.match(/fixed top-\[64px\][^"]*?z-\[(\d+)\]/);
    assert.ok(mcModalZMatch, 'MCModal must have a z-index class');
    const mcModalZ = parseInt(mcModalZMatch[1], 10);

    const layoutZMatch = layoutCode.match(/Top Navigation[\s\S]*?z-\[(\d+)\]/);
    assert.ok(layoutZMatch, 'Top Navigation must have a z-index class');
    const layoutZ = parseInt(layoutZMatch[1], 10);

    assert.ok(layoutZ > mcModalZ, `Top Navigation z-index (${layoutZ}) must be higher than MCModal (${mcModalZ})`);

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
