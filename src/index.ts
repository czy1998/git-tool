#!/usr/bin/env node
import child_process from 'node:child_process';
import { promisify } from 'node:util';
import { Separator, checkbox } from '@inquirer/prompts';
import type { handleCheckBoxConfig } from '@type/index';
import ora from 'ora';
// @ts-ignore
import yargs_parser from 'yargs-parser';
import {
  DOWN_ARROW,
  GREEN,
  RED,
  RESET,
  UP_ARROW,
  YELLOW,
  branchOperations,
} from './consts/index';

const exec = promisify(child_process.exec);

const args = process.argv.slice(2);

const { logNum = 5, h, help } = yargs_parser(args);

if (h || help) {
  console.log('');
  console.log('gTool <command>');
  console.log('');
  console.log('Usage:');
  console.log('');
  console.log(
    'gTool --logNum <num>  控制各分支获取 commit 记录的数量，默认是获取 5 条',
  );
  console.log('');

  process.exit(0);
}
if (typeof logNum !== 'number') {
  throw new Error('logNum must be a number');
}
if (logNum < 1) {
  throw new Error('logNum 不得小于1');
}
const spinner = ora();
process.on('uncaughtException', (error) => {
  if (error instanceof Error && error.name === 'ExitPromptError') {
    console.log('👋 进程已终止!');
  } else if (error.message.includes('not a git repository')) {
    spinner.fail('获取分支信息失败');
    console.log(`\n${error.message}\n`);
    process.exit(1);
  } else if (error.message.includes('findLastIndex is not a function')) {
    console.log(
      '🐛 当前 node 版本不支持 findLastIndex 方法，请切换至 20+ 的版本\n',
    );
    console.log(error.stack);
    process.exit(1);
  } else {
    throw error;
  }
});

async function work() {
  spinner.start('开始获取分支信息');
  const { stdout } = await exec('git branch', { encoding: 'utf8' });

  if (stdout.trim() === '' || stdout.includes('no branch')) {
    spinner.fail('运行目录下无任何分支，请检查运行目录是否正确');
    return;
  }

  spinner.succeed('分支信息获取成功');
  // 去除空格拆分，获取分支名
  const branchList = stdout
    .replace(/ */g, '')
    .split('\n')
    .filter(Boolean)
    .sort((x, y) => (x.includes('*') ? -1 : y.includes('*') ? 1 : 0))
    .map((v, i) => (i === 0 ? v.replace('*', '') : v));

  spinner.start(`开始获取各分支的最新${5}条commit信息`);
  const promiseList = branchList.map(async (branch, index) => {
    const { stdout } = await exec(
      `git log ${branch} --pretty="%an|%ad|%s" --date=format:"%Y-%m-%d %H:%M:%S" -n ${logNum} | awk -F '|' '{print "${RESET}" $1 "${RESET}|${YELLOW}" $2 "${RESET}|${GREEN}" $3 "${RESET}"}' | column -s '|' -t`,
      { encoding: 'utf8' },
    );
    return {
      name: branch,
      value: branch,
      description: stdout,
      disabled: index === 0,
    };
  });
  const result = await Promise.all(promiseList);
  spinner.succeed('各分支commit信息获取成功');
  const selectBranchConfig = {
    message: '请选择需要管理的代码分支',
    choices: [
      new Separator(`-----${DOWN_ARROW.repeat(3)}当前分支-----`),
      ...result.slice(0, 1),
      new Separator(`-----${UP_ARROW.repeat(3)}当前分支-----`),
      ...result.slice(1),
    ],
    emptyMessage: '所选分支不得为空，请重新选择',
  };
  const selectBranches = await handleCheckBox(selectBranchConfig);
  const selectOperationConfig = {
    message: '请选择需要执行的操作',
    choices: branchOperations,
    emptyMessage: '所选操作不得为空，请重新选择',
  };
  const selectOperations = await handleCheckBox(selectOperationConfig);
  spinner.start('执行操作中。。。');

  // 对每个分支逐个执行所选操作，避免使用管道符串联命令产生误判。
  // 例如本地删除成功、远程删除失败时，仍能记录为“部分成功”。
  const branchOperationResults = await Promise.all(
    selectBranches.map(async (branch: string) => {
      const opResults = [] as Array<{
        command: string;
        succeed: boolean;
        reason?: any;
      }>;

      for (const operation of selectOperations) {
        const command = `${operation} ${branch}`;
        try {
          // 单独执行每个操作，并记录执行结果
          await exec(command);
          opResults.push({ command, succeed: true });
        } catch (error) {
          opResults.push({ command, succeed: false, reason: error });
        }
      }

      return {
        branch,
        // 所有操作都成功才认为该分支“全部成功”
        succeed: opResults.every((item) => item.succeed),
        // 既有成功也有失败则视为“部分成功”
        partial:
          opResults.some((item) => item.succeed) &&
          opResults.some((item) => !item.succeed),
        opResults,
      };
    }),
  );

  // 统计分支结果：全部成功、部分成功、全部失败
  const fullSuccessCount = branchOperationResults.filter(
    (item) => item.succeed,
  ).length;
  const partialSuccessCount = branchOperationResults.filter(
    (item) => item.partial,
  ).length;
  const fullFailCount = branchOperationResults.filter((item) =>
    item.opResults.every((op) => !op.succeed),
  ).length;

  spinner.succeed(
    `操作执行完毕，共「${selectBranches.length}」个分支参与，` +
      `「${fullSuccessCount}」个分支全部成功，` +
      `「${partialSuccessCount}」个分支部分成功，` +
      `「${fullFailCount}」个分支全部失败`,
  );

  const errorList = branchOperationResults.flatMap((branchResult) =>
    branchResult.opResults
      .filter((op) => !op.succeed)
      .map((op) => ({
        branch: branchResult.branch,
        command: op.command,
        reason: op.reason,
      })),
  );

  if (errorList.length) {
    let errorMsg = '';
    for (const error of errorList) {
      const stderr =
        error.reason?.stderr?.split('\n')[0] ||
        error.reason?.message ||
        'unknown error';
      errorMsg += `[${error.branch}] ${error.command} CC ${stderr}\n`;
    }

    const command = `echo '${errorMsg}' | awk -F 'CC' '{print "${GREEN}" $1 "${RESET}|${RED}" $2 "${RESET}"}' | column -s '|' -t`;
    const { stdout } = await exec(command, { encoding: 'utf8' });
    console.log(stdout);
  }
}

async function handleCheckBox(config: handleCheckBoxConfig) {
  const selectValues = await checkbox({
    message: config.message,
    choices: config.choices,
  });
  if (!selectValues.length) {
    spinner.fail(config.emptyMessage);
    return await handleCheckBox(config);
  }
  return selectValues;
}

work();
