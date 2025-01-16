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
process.on('uncaughtException', (error) => {
  if (error instanceof Error && error.name === 'ExitPromptError') {
    console.log('👋 进程已终止!');
  } else if (error.message.includes('findLastIndex is not a function')) {
    console.log(
      '🐛 当前 node 版本不支持 findLastIndex 方法，请切换至 20+ 的版本\n',
    );
    console.log(error.stack);
  } else {
    console.log(error.stack);
  }
});

const spinner = ora();
async function work() {
  spinner.start('开始获取分支信息');
  const { stdout } = await exec('git branch', { encoding: 'utf8' });
  if (stdout.trim() === '') {
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

  const operationPromises = selectBranches.map(async (branch: string) => {
    const handleOperation = selectOperations.map(
      (operation) => `${operation} ${branch}`,
    );
    const command =
      selectOperations.length > 1
        ? handleOperation.join(' | ')
        : handleOperation[0];
    try {
      await exec(command);
      return { name: branch, succeed: true };
    } catch (error) {
      return { name: branch, succeed: false, reason: error };
    }
  });
  const operationResult = await Promise.allSettled(operationPromises);

  const errorList = operationResult
    // @ts-ignore
    .map((item) => item.value!)
    .filter((value) => !value.succeed);
  spinner.succeed(
    `操作执行完毕，共「${selectBranches.length}」个分支参与，「${operationResult.length - errorList.length}」个分支操作成功，「${errorList.length}」个分支操作失败`,
  );
  if (errorList.length) {
    let errorMsg = '';
    for (const error of errorList) {
      errorMsg += `[${error.reason.cmd}]CC${error.reason.stderr.split('\n')[0]}\n`;
    }

    const command = `echo '${errorMsg}' | awk -F 'CC' '{print "${RED}" $1 "${RESET}|${GREEN}" $2 "${RESET}"}' | column -s '|' -t`;
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
