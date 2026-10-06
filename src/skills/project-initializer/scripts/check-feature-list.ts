import { run } from './lib/feature-list.ts';

process.exitCode = run(process.argv.slice(2));
