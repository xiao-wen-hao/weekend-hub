import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicAnnotation} from '../server/public-summary-validation';

test('bulletin annotation cannot invent words beyond approved public text',()=>{
  const text='周末想去爬山，最好离学校近一点。';
  assert.deepEqual(validatePublicAnnotation(text,{kind:'provisional',excerpt:'最好离学校近一点'}),{kind:'provisional',excerpt:'最好离学校近一点',source:'model'});
  assert.equal(validatePublicAnnotation(text,{kind:'provisional',excerpt:'大家已经同意去爬山'}),null);
  assert.equal(validatePublicAnnotation(text,{kind:'consensus',excerpt:'周末想去爬山'}),null);
});
