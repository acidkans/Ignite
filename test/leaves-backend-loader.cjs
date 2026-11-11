// Wspolny loader testow modulu Urlopy: transpiluje z src (TypeScript) prawdziwe
// HolidaysService, LeavesService i LeaveRequestsService, zeby testy sprawdzaly realna
// logike liczenia dni, a nie jej kopie. Zaleznosci spoza liczenia dni (Prisma, poczta,
// kalendarz Google, tokeny decyzji, salda) zastepuja puste zaslepki.
//
// Uzycie: const { HolidaysService, LeavesService, LeaveRequestsService, cleanup } = require('./leaves-backend-loader.cjs')();
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'apps', 'backend', 'src');

module.exports = function loadLeavesBackend() {
    // node_modules backendu: w worktree ich nie ma — wtedy bierzemy z glownego checkoutu
    const gitCommon = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT })
        .toString().trim();
    const MODULES = [path.join(ROOT, 'apps', 'backend', 'node_modules'), path.join(path.dirname(gitCommon), 'apps', 'backend', 'node_modules')]
        .find(p => fs.existsSync(path.join(p, 'typescript')));
    if (!MODULES) throw new Error('Brak apps/backend/node_modules (typescript) — zrob npm install w apps/backend');

    // wynik musi lezec pod MODULES, zeby require('@nestjs/common') sie rozwiazal
    fs.mkdirSync(path.join(MODULES, '.cache'), { recursive: true });
    const OUT = fs.mkdtempSync(path.join(MODULES, '.cache', 'leaves-test-'));
    const ts = require(path.join(MODULES, 'typescript'));

    const transpile = (rel) => {
        const { outputText } = ts.transpileModule(fs.readFileSync(path.join(SRC, `${rel}.ts`), 'utf8'), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
                experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true,
            },
        });
        fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
        fs.writeFileSync(path.join(OUT, `${rel}.js`), outputText);
    };
    const stub = (rel, className) => {
        fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
        fs.writeFileSync(path.join(OUT, `${rel}.js`), `exports.${className} = class ${className} {};\n`);
    };

    ['leaves/holidays.service', 'leaves/leaves.service', 'leaves/leave-requests.service'].forEach(transpile);
    stub('prisma/prisma.service', 'PrismaService');
    stub('leaves/leave-balances.service', 'LeaveBalancesService');
    stub('leaves/leave-decision-token.service', 'LeaveDecisionTokenService');
    stub('mail/mail.service', 'MailService');
    stub('google-calendar/google-calendar.service', 'GoogleCalendarService');

    require(path.join(MODULES, 'reflect-metadata'));
    const { HolidaysService } = require(path.join(OUT, 'leaves', 'holidays.service.js'));
    const { LeavesService } = require(path.join(OUT, 'leaves', 'leaves.service.js'));
    const leaveRequestsModule = require(path.join(OUT, 'leaves', 'leave-requests.service.js'));

    return {
        HolidaysService,
        LeavesService,
        LeaveRequestsService: leaveRequestsModule.LeaveRequestsService,
        leaveRequestsModule, // pozostale eksporty (buildCalendarInitials, CALENDAR_LABELS…)
        cleanup: () => fs.rmSync(OUT, { recursive: true, force: true }),
    };
};
