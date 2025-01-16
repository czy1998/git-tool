// 样式 (<style>)

// 0: 默认（无样式）
// 1: 加粗
// 4: 下划线
// 7: 反显（前景与背景颜色反转）

// 前景色 (<foreground>)

// 30: 黑色
// 31: 红色
// 32: 绿色
// 33: 黄色
// 34: 蓝色
// 35: 品红
// 36: 青色
// 37: 白色

// 背景色 (<background>)

// 40: 黑色
// 41: 红色
// 42: 绿色
// 43: 黄色
// 44: 蓝色
// 45: 品红
// 46: 青色
// 47: 白色
export const RED = '\x1b[31m';
export const YELLOW = '\x1b[33m';
export const GREEN = '\x1b[32m';
export const RESET = '\x1b[0m';

export const UP_ARROW = '\u2191';
export const DOWN_ARROW = '\u2193';

export const branchOperations = [
  {
    name: '删除本地分支',
    value: 'git branch -D',
  },
  {
    name: '删除远程分支',
    value: 'git push origin -d',
  },
];
