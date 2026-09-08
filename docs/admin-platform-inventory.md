# AnotherMe 관리자 플랫폼 인벤토리

이 문서는 현재 사용자 서비스와 관리자 기능의 연결 지점을 고정하고, 공식 AI 계정·IP·NFT·콘텐츠를 하나의 운영 콘솔로 통합하기 위한 기준 문서다.

## 현재 사용자 서비스 도메인

| 사용자 영역 | 현재 화면/API | 관리자에서 관리할 대상 |
| --- | --- | --- |
| 홈·프로필 | 홈, 프로필, Another Me, FAN/STAR, 랭킹 | 회원 상태, 장착 IP/NFT, 스탯, 성장 이력 |
| 피드 | STAR Feed, 게시물, 리포스트, 신고 | 게시물, 신고, 노출, 공식 계정 게시물 |
| 채팅·통화 | 1:1/그룹 채팅, 보이스톡, 영상통화 | 방, 신고, 차단, 통화 오류, 공식 AI 채팅 |
| 검색 | 사용자·게시물·트렌딩 검색 | 검색어 차단, 인기 검색어, 검색 품질 |
| 성장 | 성장 RPG, 미션, 퀘스트, 배틀, 클랜 | 프로그램, 미션, 보상, 시즌, 게시 상태 |
| 보상 | 일일 대화 보상, XP, 포인트 | 규칙, 지급·회수, 이상 징후 |
| NFT | 장착, 소유권 확인, 캐릭터 소환 | 컬렉션, 체인, IP 연결, 분석, 성장 단계 |
| AI·온톨로지 | Another Me, Persona, Knowledge | 공식 AI별 페르소나·지식·온톨로지 |

## 현재 흩어진 관리자 기능

- `/settings/nft-admin`: NFT 등록, AI 분석, 검토/게시
- `/settings/knowledge-admin`: Knowledge source, Google 검색, 추출, 리뷰 승인
- `/settings/ontology`: 사용자 Persona 온톨로지 조회
- `starFeedAdmin` API: 피드 신고 조회·처리
- `searchAdmin` API: 검색어 차단 관리
- `officialAccounts` API: 비비 전용 프로필·친구·채팅방
- `knowledge` API: Knowledge, 리뷰, 캠페인, user memory, 온톨로지 미리보기

## 통합 원칙

1. 비비는 예외 코드가 아니라 `official_ai_account` 데이터의 첫 번째 레코드다.
2. 사람 계정, 공식 AI 계정, 시스템 계정은 별도 식별자와 권한을 갖는다.
3. IP와 AI 계정을 분리한다. 하나의 IP가 여러 AI 계정을 가질 수 있고, NFT가 없는 교육/코칭 AI도 허용한다.
4. AI 생성 결과는 초안으로 저장하고 관리자 승인 후에만 사용자에게 게시한다.
5. 사용자 화면에서 사용하는 데이터는 관리자에서 동일한 상태·버전·게시 정책을 사용한다.
6. 관리자 작업은 모두 감사 로그와 변경 사유를 남긴다.

## 목표 관리자 IA

```text
/app/admin
├─ dashboard
├─ members
├─ ai-accounts
├─ ip-profiles
├─ nft-collections
├─ knowledge
├─ conversation-rules
├─ growth-programs
├─ feed
├─ chats-calls
├─ moderation
├─ search
├─ rewards
├─ analytics
└─ audit-log
```

기존 설정 경로는 호환성을 위해 목표 관리자 경로로 redirect하고, 새 기능은 관리자 레이아웃 안에서만 추가한다.

## 운영 상태 표준

모든 관리 대상은 `draft → review_required → approved → published` 흐름을 기본으로 사용한다. 오류는 `failed`, 중지는 `suspended`, 종료는 `archived`로 통일한다. AI 작업에는 별도 `queued → processing → completed/failed` 상태를 둔다.

## 단계별 구현 기준

1. 현재 스키마·라우트·화면을 이 문서와 대조해 누락을 제거한다.
2. 관리자 레이아웃과 RBAC를 먼저 만든다.
3. 회원·공식 AI·IP·NFT 상세 페이지를 동일한 목록/상세/탭 패턴으로 만든다.
4. Knowledge·온톨로지·대화 규칙을 공식 AI 계정에 연결한다.
5. 피드·검색·채팅·통화·신고 API를 관리자 큐에 연결한다.
6. 모든 변경을 감사 로그로 남기고, 권한·게시·롤백을 통합 테스트한다.
