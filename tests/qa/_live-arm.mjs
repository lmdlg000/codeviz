import { launchBrowser, newPage } from './harness.mjs';

const LIVE = 'https://codeviz.231621.xyz/';
const CODE = `#include <iostream>
#include <iomanip>
#include <sstream>
#include <string>
#include <set>
using namespace std;
static int gN;
static int gCnt[10];
static long long gPow[10];
static set<long long> gFound;
bool MatchMultiset(long long s) {
  int c[10] = {0}; int len = 0;
  while (s > 0) { c[s%10]++; s/=10; len++; }
  if (len != gN) return false;
  for (int d=0; d<=9; d++) if (c[d] != gCnt[d]) return false;
  return true;
}
void Search(int digit, int remaining) {
  if (remaining == 0) {
    long long s=0;
    for (int d=0; d<=9; d++) s += (long long)gCnt[d]*gPow[d];
    if (MatchMultiset(s)) gFound.insert(s);
    return;
  }
  if (digit == 0) { gCnt[0]=remaining; Search(-1,0); gCnt[0]=0; return; }
  for (int k=remaining; k>=0; --k) { gCnt[digit]=k; Search(digit-1,remaining-k); }
  gCnt[digit]=0;
}
int main() {
  int n = 3;
  gN = n;
  for (int i=0;i<=9;i++) { gPow[i]=1; for(int e=0;e<n;e++) gPow[i]*=i; }
  Search(9,n);
  ostringstream nums;
  int m = 0;
  for (set<long long>::iterator it = gFound.begin(); it != gFound.end(); ++it) {
    if (m>0) nums << ' ';
    nums << *it;
    m++;
  }
  cout << left << setw(16) << "n = 3" << setw(8) << nums.str() << "Total: " << m << endl;
  return 0;
}`;

const browser = await launchBrowser();
const { context, page, issues } = await newPage(browser, { viewport: { width: 1560, height: 960 } });
await page.goto(`${LIVE}#/lab`, { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForFunction(() => Boolean(document.querySelector('.cm-content')), null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.locator('.cm-content').click();
await page.keyboard.press('Control+A');
await page.keyboard.insertText(CODE);
await page.waitForTimeout(400);
await page.getByRole('button', { name: '分析代码' }).click();
await page.waitForTimeout(2200);
console.log('status ::', await page.evaluate(() => document.querySelector('.lab-status')?.textContent?.trim()));
await page.getByRole('tab', { name: '诊断' }).click();
await page.waitForTimeout(250);
console.log('diag ::', await page.evaluate(() => [...document.querySelectorAll('.cvz-diag__message')].map((el) => el.textContent.trim())));
await page.getByRole('tab', { name: '单步执行' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: '运行追踪' }).click();
await page.waitForFunction(() => Boolean(document.querySelector('.cvz-trace')), null, { timeout: 15000 });
await page.waitForTimeout(500);
for (let i = 0; i < 5; i++) {
  const btn = page.getByRole('button', { name: /运行到结束|继续到断点|继续/ }).first();
  if (await btn.count()) await btn.click().catch(() => {});
  await page.waitForTimeout(500);
}
console.log('trace ::', await page.evaluate(() => ({
  console: document.querySelector('.cvz-trace__console')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  error: document.querySelector('.lab-trace-error')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  step: [...document.querySelectorAll('.cvz-trace__counter')].map((el) => el.textContent.trim()).slice(0, 1),
})));
console.log('errors', issues.pageErrors, issues.consoleErrors);
await context.close();
await browser.close();
