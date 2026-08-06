---
title: "JavaScript 클로저(Closure) 정리"
date: 2026-08-06T13:00:00+09:00
updated: 2026-08-06T13:00:00+09:00
category: JavaScript
tags: [javascript, closure, scope]
summary: "클로저가 무엇인지, 왜 생기는지, 실무에서 어떻게 쓰이는지 예제 코드와 함께 정리했습니다."
draft: false
---

## 클로저란?

**클로저(Closure)** 는 함수가 선언될 때의 렉시컬 환경(Lexical Environment)을 기억해서,
함수가 그 환경 밖에서 실행되어도 그 환경에 접근할 수 있는 현상을 말한다.

```js
function makeCounter() {
  let count = 0; // 이 변수는 makeCounter가 끝나도 살아남는다

  return function () {
    count += 1;
    return count;
  };
}

const counter = makeCounter();
console.log(counter()); // 1
console.log(counter()); // 2
```

`makeCounter`의 실행이 끝났는데도 `count`가 사라지지 않는 이유:
반환된 함수가 `count`를 **참조하고 있어서** 가비지 컬렉션 대상이 되지 않기 때문이다.

## 자주 나오는 함정: 반복문과 클로저

```js
// ❌ var는 함수 스코프 → 전부 3이 출력됨
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100);
}

// ✅ let은 블록 스코프 → 0, 1, 2
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100);
}
```

| 구분 | `var` | `let` |
| --- | --- | --- |
| 스코프 | 함수 | 블록 |
| 반복문에서 | 하나의 변수 공유 | 매 반복마다 새 바인딩 |

## 실무에서 쓰이는 곳

1. **데이터 은닉** — 외부에서 직접 수정 못 하는 private 상태 만들기
2. **커링/부분 적용** — 인자를 미리 고정한 함수 만들기
3. **이벤트 핸들러** — 등록 시점의 상태를 기억해야 할 때

핵심은 하나다: *함수는 자신이 태어난 곳의 변수를 기억한다.*
