const assert = require('assert');
const path = require('path');

suite('Extension Test Suite', () => {
    const packageJson = require(path.resolve(__dirname, '..', '..', 'package.json'));

    test('Manifest should define expected extension identity', () => {
        assert.strictEqual(packageJson.publisher, 'JochenYang');
        assert.strictEqual(packageJson.name, 'codingplan-status-vscode');
        assert.strictEqual(packageJson.main, './extension.js');
    });

    test('Manifest should contribute required commands', () => {
        const commands = packageJson.contributes.commands.map((item) => item.command);
        assert.ok(commands.includes('codingplanStatus.refresh'));
        assert.ok(commands.includes('codingplanStatus.setup'));
        assert.ok(commands.includes('codingplanStatus.switchProvider'));
        assert.ok(commands.includes('codingplanStatus.showInfo'));
        assert.ok(commands.includes('codingplanStatus.showHelp'));
        assert.ok(commands.includes('codingplanStatus.showLogs'));
    });
});
