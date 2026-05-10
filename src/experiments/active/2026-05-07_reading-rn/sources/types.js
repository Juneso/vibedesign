// BookSource 어댑터 인터페이스 (런타임 검사 X — 문서/JSDoc 용도)
//
// /**
//  * @typedef {Object} BookHit
//  * @property {string}    isbn13       정규화된 ISBN-13 (없으면 빈 문자열)
//  * @property {string}    title
//  * @property {string[]}  authors
//  * @property {string=}   coverUrl
//  * @property {number=}   pageCount    페이지수가 자동 미수신이면 undefined → UI가 입력 폴백 노출
//  * @property {string=}   publisher
//  * @property {string=}   publishedDate
//  * @property {'kakao'|'aladin'|'google'|'manual'} source
//  */
//
// /**
//  * @typedef {Object} BookSource
//  * @property {(query: string) => Promise<BookHit[]>} search
//  * @property {string} name
//  */

export const SOURCE_PRIORITY = ['aladin', 'kakao', 'google', 'manual'];
