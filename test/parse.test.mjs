import assert from 'node:assert/strict'
import test from 'node:test'
import { parseNames, tidyName } from '../index.js'

test('fill keeps $ patterns literal', async () => {
  const { fill } = await import('../index.js')
  const out = fill('a {x} b', { x: "a $& b $1 $'" })
  assert.equal(out, "a a $& b $1 $' b")
})

test('tidyName separates Latin and Han', () => {
  assert.equal(tidyName('CPyMO掌机移植'), 'CPyMO 掌机移植')
  assert.equal(tidyName('RG35XX交接包'), 'RG35XX 交接包')
})

test('tidyName strips leading list markers', () => {
  assert.equal(tidyName('- 磁盘清理'), '磁盘清理')
  assert.equal(tidyName('1. 磁盘清理'), '磁盘清理')
})

test('parseNames drops sentences, long names and duplicates', () => {
  const raw = ['- 会话命名规则调整', '命名功能已通过校验', '这是一个很长的名字超过二十四个字符的候选名字', '会话命名规则调整', 'CPyMO 交接包'].join('\n')
  assert.deepEqual(parseNames(raw, ''), ['会话命名规则调整', 'CPyMO 交接包'])
})

test('parseNames drops the current title and caps at three', () => {
  const raw = ['同一个名字', '二', '三', '四'].join('\n')
  assert.deepEqual(parseNames(raw, '同一个名字'), ['二', '三', '四'])
})

test('parseNames rejects status openers', () => {
  assert.deepEqual(parseNames('已完成的整理\n正在迁移\n完成打包', ''), [])
})
