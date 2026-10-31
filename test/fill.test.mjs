import test from 'node:test'
import assert from 'node:assert/strict'

import { fill } from '../index.js'

test('keeps $ replacement patterns literal in values', () => {
  const prompt = fill('现有标题：{title}\n开头：{first_user_message}', {
    title: 'a $& b',
    first_user_message: "c $1 d $' e $` f $$ g",
  })
  assert.equal(prompt, "现有标题：a $& b\n开头：c $1 d $' e $` f $$ g")
})

test('replaces every placeholder and leaves unknown keys empty', () => {
  assert.equal(fill('{a}|{b}|{c}', { a: '1', b: '2' }), '1|2|')
})
