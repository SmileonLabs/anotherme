# 실시간 통신 안정화 검증 보고서 (2026-09-06)

## 판정 요약

이번 작업은 코드·운영 구성에서 재현 가능한 결함을 우선 수정한 단계다. 로컬 정적 검사와 단위 테스트를 통과하더라도 실제 KT·SKT·LGU+ 망, iPhone Safari/설치형 PWA, UDP 차단망, LiveKit Cloud를 포함한 종단 간 장애 시험을 수행하지 않은 항목은 통과로 판정하지 않는다.

운영 디스크 긴급 조치와 호스트 모니터 설치는 완료했다. API/PWA 안정화 코드는 운영 배포 전 최종 검증 단계이며, 데이터베이스 마이그레이션의 운영 사전 측정과 복구 리허설 없이 상용 안정화 완료로 보지 않는다.

## 최종 자동 검증

- API: 33개 테스트 파일 통과, 인프라 통합 2개 파일 skip / 92개 테스트 통과, 2개 skip. 타입 검사와 production build도 통과했다.
- 모바일: reliability 63/63, 통화 foreground plugin 4/4, `callApi` 계정 fence 3/3, 타입 검사 통과.
- API client: deadline·취소·auth/profile generation reliability 8/8 통과.
- PWA: production 환경변수로 별도 산출물 `web-build-reliability-final-20260906`을 생성했다. 주 bundle은 7.25 MiB이며, 로컬 정적 서버에서 `/app/`, `sw.js`, SPA fallback은 200, 없는 정적 자산은 404를 확인했다. 빌드 중 임시 `app.json`은 원본으로 복구됐고 민감 키 패턴은 산출물에서 발견되지 않았다.
- OpenAPI codegen 전후 361개 파일 SHA-256 집계는 `28d67d93fb05570a0de031e6a47e1c3a438f335d7772fe914215ac443ca2ef93`로 동일했다. 현재 uncommitted tree에서는 drift 명령의 Git 비교 단계가 의도적으로 실패하므로 생성 파일 commit 후 별도 OpenAPI workflow에서 재확인한다.
- `git diff --check` 통과, staged/conflict 0. PostgreSQL·Redis 통합 2건, Caddy container validate, 실기기와 운영 종단 시험은 자동 통과에 포함하지 않았다.

## 사실·가설·장기 과제 분류

### 확인된 결함

- 운영 루트 파일시스템은 작업 전 116 GiB 중 약 108 GiB를 사용해 94%였고 실제 여유는 약 7.7 GiB였다. 주 점유원은 Docker 로그가 아니라 `/opt/anotherme-*release/build/apk*` 형태로 누적된 과거 릴리스/빌드 디렉터리였다.
- 기존 Caddy 응답은 HTTP/3 `Alt-Svc`를 광고했지만 Docker는 TCP 443만 게시했고, 호스트 방화벽과 보안그룹에도 UDP 443 경로가 없었다. 광고와 도달 가능성이 불일치했다. 다만 이 불일치가 셀룰러 장애의 주원인이었다는 뜻은 아니다.
- 클라이언트 종료 전송에만 의존하면 앱 강제 종료·네트워크 단절 시 서버 `active` 상태와 사용자 잠금이 남을 수 있었다. 서버가 LiveKit 참가자 상태와 주기적으로 대조하는 정합성 복구 경로가 없었다.
- 통화 제어가 통화 세대(attempt)를 일관되게 식별하지 않았고, 이전 통화의 늦은 요청과 새 통화의 잠금을 안전하게 분리한다는 서버 불변식이 부족했다.
- 통화 카드에서 참여/거절할 때 기존 통화의 세대 ID 대신 새 ID를 만들 수 있어, 세대 검증을 활성화하면 정상 카드 동작이 충돌할 수 있었다.
- 채팅의 최신 50개 조회만으로는 단절 중 50개를 초과한 누락 메시지를 복구할 수 없었다. 재전송·실시간 이벤트·조회 결과를 동일 클라이언트 메시지 ID와 서버 순번으로 일관되게 합치는 경로도 불완전했다.
- 타이핑 신호가 송신자에게 되돌아와 불필요한 재조회가 발생할 수 있었고, 타이핑/presence 요청의 동시 실행·만료·중단 정책이 분리되지 않았다.
- 서비스 워커 설치 중 일부 자산만 캐시된 상태가 다음 실행에 남을 수 있었고, API/인증 응답과 앱 셸 캐시의 경계가 충분히 명시적이지 않았다.
- 채팅 조회가 시작될 때의 배열을 그대로 반환해, 조회 중 추가된 optimistic 메시지·서버 확인·realtime 메시지가 늦은 조회 결과에 덮일 수 있었다. 최신 50건과 `afterSeq`를 병렬 조회하는 사이 서버 순번이 증가하면 중간 구간 복구가 다음 임의 refetch까지 미뤄지는 경합도 있었다.
- 서버/다른 탭에서 활성 캐릭터가 바뀐 응답은 request profile getter만 바꾸고 이전 프로필 query cache를 commit 전에 제거하지 않아, 이전 캐릭터 데이터가 새 캐릭터 문맥에서 잠시 재사용될 수 있었다.
- 같은 Web Push endpoint/FCM token이 로그아웃·계정 전환 뒤 이전 사용자 행에도 남을 수 있었고, 늦은 A 등록이 B 등록 또는 로그아웃 revoke보다 나중에 끝나 최종 소유권을 되돌릴 수 있었다.
- 링크 미리보기는 hostname의 실제 A/AAAA를 확인하지 않고 자동 redirect를 사용해, DNS가 사설 주소를 가리키거나 공개 URL이 loopback/metadata 주소로 redirect할 때 서버 내부망 요청이 가능했다.
- 운영 로그 회전, 디스크 보관 상한, 여유 공간 사전 배포 차단, 디스크 추세 기록이 일관된 코드형 운영 정책으로 관리되지 않았다.

### 재현이 필요한 가설

- HTTP/3 광고 불일치가 Wi-Fi가 아닌 셀룰러 접속 실패의 주원인이라는 가설. 현재 확인된 것은 구성 불일치뿐이며 통신사별 패킷 캡처와 변경 전후 연결 시간 표본이 없다.
- 타이핑/presence 요청 적체가 iPhone 장시간 입력 지연의 주원인이라는 가설. 요청 수를 제한했지만 렌더 증가, 이미지/스티커 디코딩, 메모리 증가, WebKit 조합 입력 문제와 각각 A/B 비교해야 한다.
- LiveKit JavaScript SDK 2.22.2의 재연결 후 원격 ICE 후보 버퍼링 수정이 실제 장애를 직접 해결한다는 가설. 사용 중이던 버전과 영향 가능성은 확인했으나 장애 당시 ICE 로그가 없어 원인으로 확정하지 않는다.
- iPhone 자동재생 제한이 “연결됐지만 소리가 없음” 사례의 전부 또는 다수라는 가설. 재생 차단 상태와 사용자 탭 복구를 분리했지만 실제 장애 표본의 분류가 필요하다.
- 앱 도메인의 AAAA 부재나 `www` 이름 부재가 현재 장애를 만들었다는 가설. 현재 사용 경로와 장애 시 DNS 기록을 대조하기 전에는 원인으로 보지 않는다.

### 장기 개선 과제

- KT·SKT·LGU+ 실기기 매트릭스, 지원 iOS별 Safari/설치형 PWA, Wi-Fi↔셀룰러 전환, 백그라운드/잠금/복귀를 자동화 또는 정기 수동 회귀 시험으로 운영한다.
- Web Push를 네이티브 VoIP 수신과 동일하게 취급하지 않는다. 잠금 상태의 안정적인 수신/통화 UI가 제품 요구라면 iOS PushKit/CallKit 및 Android Telecom 계층을 별도 검토한다.
- LiveKit Cloud 지역/경로 장애, TURN/TLS 강제 경로, 실제 양방향 RTP를 지속적으로 검증하는 합성 통화 프로브를 둔다.
- 클라이언트 채팅 outbox에는 로그인 상태나 강제 종료 뒤 최대 24시간 메시지 본문이 AsyncStorage/localStorage에 **평문으로** 남을 수 있다. 정상 로그아웃·계정 전환은 해당 계정 namespace를 즉시 파기하고 전체 namespace의 24시간 초과 데이터도 제거하지만 이는 저장 중 암호화를 대체하지 않는다. native 기기 키 기반 암호화와 web 본문 비영속 정책은 별도 장기 과제다.
- 구조화 진단 로그를 전용 수집/검색/경보 시스템으로 보내고 개인정보 영향평가, 접근통제, 보존기간을 운영 정책으로 확정한다.
- 현재 JSON 열에 저장된 push credential을 고유 device-binding 테이블로 정규화한다. 지금의 원자적 재귀속은 정확성을 우선해 non-null 사용자 행을 스캔하므로 사용자 수 증가 전 인덱스 가능한 구조로 이전해야 한다.
- 링크 미리보기 원격 OG 이미지는 현재 server serializer와 client renderer 양쪽에서 fail-closed로 비활성화했다. 향후 썸네일을 다시 제공하려면 DNS pinning, redirect 재검증, image content-type·크기 제한을 가진 인증된 same-origin proxy/cache가 필요하다.
- Android 일반 알림의 FCM `notification` block은 OS가 앱 코드보다 먼저 표시할 수 있어 이미 발송 대기 중이던 이전 계정 알림을 로컬 owner fence로 차단할 수 없다. data-only+검증 후 표시 전환 또는 네이티브 계정별 알림 계층을 별도 검토한다.
- 최종 PWA main JavaScript 산출물은 7.25 MiB다. 이 크기가 장시간 입력 지연의 원인이라는 증거는 없지만 셀룰러 초기 로드와 iPhone 메모리의 별도 release risk이므로 route 단위 code-splitting, avatar/sticker/image lazy-load·thumbnail, 실제 Safari/설치형 PWA의 FCP·INP·heap 측정을 이어간다.
- 단일 호스트/단일 리전 의존, CDN·로드밸런서·AAAA 및 `www` 경로는 현재 장애 원인과 분리해 복원력 로드맵으로 다룬다.

## 적용한 변경

### 1. 디스크 용량·로그·알림

**근거**

- 조치 전: 사용률 94%, 여유 약 7.7 GiB.
- 과거 릴리스/빌드 디렉터리 42개가 주 점유원이었다. Docker 애플리케이션 로그는 약 47 MiB, systemd journal은 약 279 MiB 수준으로 주원인이 아니었다.

**수정 파일**

- `docker/cleanup-production-disk.sh`
- `docker/install-host-operations.sh`
- `docker/ops/anotherme-disk-monitor.sh`
- `docker/ops/anotherme-disk-monitor.service`
- `docker/ops/anotherme-disk-monitor.timer`
- `docker/ops/journald-anotherme.conf`
- `docker-compose.server.yml`
- `docker/deploy-production.sh`
- `docs/operations/disk-capacity.md`

**변경 동작**

- 정리 스크립트는 기본 dry-run이며 현재 컨테이너 마운트, 현재/롤백 이미지, 정리 스크립트가 있는 릴리스를 보호한다. Docker 인벤토리를 완전히 읽지 못하면 apply를 거부한다.
- 승인 후 정확히 42개 후보를 제거해 67,063,078,912 bytes를 회수했다.
- 조치 후 사용률은 39%, 여유는 75,489,030,144 bytes(약 70.3 GiB)였다.
- journald는 512 MiB/14일/최소 여유 5 GiB로 제한했고 실제 journal 사용량은 약 279 MiB에서 약 40 MiB로 줄었다.
- 15분 주기 호스트 타이머가 사용량, 시간당 증감, 임계 도달 예상 시간을 35일간 제한 저장한다. 경고/위험 전환은 journal에 남기며, 외부 webhook 주소는 승인된 목적지가 없어 아직 설정하지 않았다.
- 모든 주요 컨테이너는 `json-file` 50 MiB × 5개 회전을 사용한다. 기존 컨테이너에는 재생성 후 적용된다.
- 배포 전 10 GiB 미만이면 마이그레이션 전에 중단하고, API 이미지는 digest 고정을 요구한다.

**테스트와 지표**

- 정리 스크립트 dry-run/apply 보호 조건과 Bash 구문을 확인했다.
- 설치된 timer는 active이며 서비스 실행은 성공했다.
- 정리 직후 같은 초에 채취한 두 표본은 증가 속도 추정에 사용할 수 없다. 이후 15분 표본부터 추세를 계산하며, 충분한 기간의 증가 속도는 아직 미검증이다.

**남은 위험 / 롤백**

- 외부 경보 목적지가 없어 현재 알림은 호스트 journal에만 남는다.
- Neo4j 등 기존 컨테이너는 승인된 유지보수 재생성 전까지 새 Docker 로그 제한이 적용되지 않을 수 있다.
- 삭제한 빌드 산출물은 되돌리지 않고 Git과 불변 이미지에서 재생성한다. 호스트 정책 롤백은 timer/service 비활성화, journald drop-in 제거, 컨테이너별 기존 logging 설정 복원 순서로 수행한다.

### 2. 통화 세대·종료 멱등성·서버 정합성

**근거**

- 종료 API가 도착하지 않는 실패 경로와 오래된 이벤트가 새 통화에 영향을 주지 않는다는 서버 보장이 부족했다.

**수정 파일**

- `lib/db/src/schema/calls.ts`
- `lib/db/drizzle/0028_call_consistency.sql`
- `artifacts/api-server/src/lib/callControl.ts`
- `artifacts/api-server/src/lib/callReconciliation.ts`
- `artifacts/api-server/src/routes/calls.ts`
- `artifacts/api-server/src/routes/livekitWebhooks.ts`
- 관련 단위·통합 테스트

**변경 동작**

- 발신자가 생성한 `attemptId`를 통화 행에 저장하고 `(caller_id, attempt_id)`를 고유하게 해 생성 응답 유실 후 재시도를 한 행으로 수렴시킨다.
- 종료/취소/거절/실패는 작업 UUID를 영속 ledger에 기록해 같은 요청을 반복해도 동일 결과를 반환한다.
- 상태 변경과 `call_id`로 한정된 잠금 해제를 한 트랜잭션에서 수행한다. 늦은 A 작업은 B 잠금을 사용자 ID만으로 지울 수 없다.
- LiveKit webhook은 빠른 관측 힌트일 뿐 직접 종료 근거가 아니다. 두 API replica의 주기 worker가 lease를 획득하고 LiveKit 참가자를 조회하며, 같은 부족 상태가 유예시간을 넘어 지속되고 두 번째 권위 조회도 일치할 때만 해당 통화를 종료한다.
- 앱 heartbeat 부재는 종료 판단에 사용하지 않는다. 기본 정책은 최초 연결 90초, 빈 방 120초, 한 참가자 300초이며 각각 별도 상태로 적용한다.
- 과거 클라이언트/행과의 롤링 호환을 위해 운영자가 `CALL_ATTEMPT_HEADER_ENFORCE_AFTER`를 설정한 이후 생성된 추적 통화에만 누락 헤더를 거부한다. 전달된 잘못된 세대 ID는 시점과 무관하게 거부하고, `attempt_id IS NULL`인 기존 행은 호환한다.

**테스트와 지표**

- 늦은 A 종료가 B 잠금을 해제하지 않는 규칙, 작업 UUID 재사용 충돌, 세대 일치/불일치, 초기/빈방/한 참가자 유예, 일시적 LiveKit 오류와 없는 방의 구분을 단위 테스트했다.
- PostgreSQL/Redis를 사용하는 통합 테스트는 작성했지만 현재 로컬 Docker 엔진 장애로 실제 실행하지 못했다. CI의 PostgreSQL 16/Redis job에서 실행하도록 연결해야 최종 통과 판정할 수 있다.

**남은 위험 / 롤백**

- 운영 데이터의 calls/messages 크기와 인덱스 생성 시간을 읽기 전 마이그레이션을 적용하지 않는다.
- LiveKit Cloud 콘솔에 서명 webhook URL을 등록해야 webhook 지연 단축 효과가 생긴다. 주기 대조는 등록 여부와 독립적으로 동작한다.
- 롤백은 먼저 attempt 헤더 강제 시점을 해제해 구 클라이언트 호환을 열고, 이전 API 이미지로 복귀한다. 스키마 추가 열/인덱스는 호환성이 있으므로 장애 중 즉시 삭제하지 않는다.

### 3. LiveKit 재연결·미디어 상태

**근거**

- 연결 상태와 오디오/비디오 준비 상태가 섞여 카메라 실패가 가능한 음성 경로까지 종료시킬 수 있었고, 이전 비동기 이벤트/타이머가 새 연결에 영향을 줄 여지가 있었다.

**수정 파일**

- `artifacts/mobile/components/CallProvider.tsx`
- `artifacts/mobile/lib/voiceCall.ts`
- `artifacts/mobile/lib/voiceCall.web.ts`
- `artifacts/mobile/lib/callApi.ts`
- `artifacts/mobile/lib/callAttemptPolicy.ts`
- `artifacts/mobile/lib/callRecoveryPolicy.ts`
- `artifacts/mobile/package.json`
- `pnpm-lock.yaml`

**변경 동작**

- `livekit-client`를 2.22.2로 고정했다. React Native wrapper 2.11.1의 peer 범위 `^2.19.0`과 호환됨을 설치된 패키지와 lockfile에서 확인했다.
- Wi-Fi↔셀룰러 변경 때 앱이 즉시 별도 Room을 만드는 정책을 사용하지 않는다. SDK 자동 재연결을 우선하고, 최종 disconnect 뒤 서버가 같은 통화를 여전히 active로 확인한 경우에만 한 번 제한 재가입한다.
- 사용자 종료, 상대 거절, 참가자 강제 제거, room closed 등은 자동 복구 대상에서 제외한다.
- 연결 generation, Room, 비동기 응답, listener, timer, 미디어 track을 fence/cleanup해 이전 연결이 새 연결을 덮지 못하게 한다.
- 통화 연결 상태, 로컬/원격 마이크 발행·구독·mute·RTP live, 카메라 발행·구독·live, 브라우저 재생 허용을 별도로 분류한다. 카메라 거부·지연·끄기만으로 사용 가능한 음성 통화를 종료하지 않는다.
- iOS Safari 재생 차단은 “소리 재생” 사용자 동작으로 복구할 수 있게 한다.

**테스트와 지표**

- 오디오 준비와 카메라 대기 분리, mute/미발행/재생 차단 구분, 재가입 1회 및 종료 사유 제외, 연결 listener 부착 시점 경합을 단위 테스트했다.
- SDK 2.22.2에 재연결 후 ICE 후보 버퍼링 수정이 포함된 것은 공식 릴리스로 확인했다. 실제 장애가 그 버그였는지는 통화 당시 ICE 로그가 없어 미확정이다.

**남은 위험 / 롤백**

- 실제 통신사망 전환과 UDP 차단 TURN/TLS 양방향 미디어는 미검증이다.
- 브라우저 RTP 통계가 “상대 스피커에서 실제 들림”을 완전히 증명하지는 않는다. 합성 수신 오디오 검증이 필요하다.
- 롤백은 클라이언트 이전 이미지/PWA로 되돌리되 서버의 멱등·정합성 기능은 하위 호환 상태로 유지한다.

### 4. API·진단 정책

**근거**

- 공통 요청 계층은 응답 헤더 이후 본문이 멈추거나 인증 토큰 획득이 멈추면 deadline이 끝까지 적용되지 않을 수 있었다. 통화 시도 전체를 한 ID로 연결하는 표준도 없었다.

**수정 파일**

- `lib/api-client-react/src/custom-fetch.ts`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/lib/callDiagnostics.ts`
- `artifacts/api-server/src/lib/logger.ts`
- `docker/Caddyfile`
- 클라이언트 통화 진단/outbox 파일

**변경 동작**

- 공통 fetch는 호출자가 선택한 deadline과 취소 신호를 합성하고 인증 토큰 획득부터 응답 본문 소비까지 적용한다. timeout을 서버 작업 취소로 간주하지 않으며 공통 계층에서 자동 재시도하지 않는다.
- 조회, 타이핑/presence, 메시지 전송, 통화 제어, 업로드/장시간 연결이 각자 정책을 선택한다.
- API는 안전한 `X-Request-Id`를 유지하거나 새 UUID를 발급해 응답하고, 통화 생성부터 진단/종료까지 같은 attempt ID를 전달한다.
- 서버 도달 전 실패를 포함한 통화 진단은 bounded queue에 최대 120개/24시간 보관하고 4초 deadline으로 재접속 후 전송한다. 종료 outbox는 최대 20개/48시간이며 서버 정합성의 보조 수단이다.
- 진단 key/value를 허용 범위로 제한하고 authorization, cookie, token, 메시지 본문, SDP/ICE candidate, URL, 사용자/프로필 식별자를 제거한다. 사용자별 rate limit을 적용한다.
- Caddy는 원본 사용자 correlation 헤더를 그대로 신뢰해 로그에 쓰지 않고 edge 요청 UUID를 API로 전달한다. URI query와 headers는 access log에서 제거하고 IP를 마스킹한다.

**테스트와 지표**

- 인증 획득 deadline, 멈춘 body deadline, 비협조 body, 사용자 취소 구분, query/fragment 비노출, Request signal 합성을 단위 테스트했다.
- 진단 민감 키/값 제거와 call/attempt 접근 경계를 단위 테스트했다.

**남은 위험 / 롤백**

- 전용 원격 로그 저장/대시보드/외부 경보는 아직 구성하지 않았다.
- 장애 시 로그 샘플링 비율과 비용 상한은 운영 데이터로 조정해야 한다.
- 롤백 시 edge UUID와 안전 serializer는 유지 가능하며, 문제되는 진단 endpoint만 라우팅 차단할 수 있다.

### 5. 채팅 멱등 전송·누락 복구·iPhone 계측

**근거**

- 응답 유실 후 재전송, 실시간 이벤트, 누락 조회가 겹칠 때 한 메시지로 수렴해야 하며 단절 중 50개 초과 메시지도 전부 복구해야 한다.

**수정 파일**

- `artifacts/api-server/src/routes/messages.ts`
- `artifacts/api-server/src/lib/chatMessagePolicy.ts`
- `artifacts/mobile/lib/chatMessageOutbox.ts`
- `artifacts/mobile/lib/chatMessageReliability.ts`
- `artifacts/mobile/lib/chatConfirmedCursorStore.ts`
- `artifacts/mobile/hooks/useReliableRoomMessages.ts`
- `artifacts/mobile/components/ChatOutboxDrainer.tsx`
- `artifacts/mobile/hooks/useChatSendHandlers.ts`
- `artifacts/mobile/lib/realtime.ts`
- `artifacts/mobile/lib/chatPerformanceDiagnostics.ts`
- `artifacts/mobile/hooks/useEphemeralSignal.ts`
- `artifacts/mobile/hooks/usePresence.ts`
- 채팅 화면/메시지 컴포넌트와 관련 테스트

**변경 동작**

- 모든 사용자 메시지에 클라이언트 작업 UUID를 부여한다. 서버는 `(room, sender, clientMessageId)` 고유 제약과 트랜잭션 advisory lock으로 한 번만 저장하며 같은 ID에 다른 payload를 보내면 409를 반환한다.
- 로컬 상태는 전송 대기/서버 확인/실패를 구분하고, 일시 오류만 지수 backoff로 최대 8회/30분 안에서 재시도한다. outbox는 사용자별 최대 100개/24시간이며 foreground·online 복귀 시 앱 루트 drainer가 현재 열지 않은 방도 제한적으로 처리한다. 앱 시작과 인증 세션 전환 때 현재 계정뿐 아니라 기기에 남은 모든 계정 outbox key를 검사해 24시간 초과 본문을 제거한다.
- 정상 로그아웃과 Clerk 사용자 전환은 이전 계정의 exact outbox key만 즉시 삭제한다. 진행 중이던 이전 계정 전송 continuation은 owner generation으로 차단해 삭제 뒤 실패 행을 다시 쓰지 못하게 한다. 캐릭터 프로필 전환은 같은 계정이므로 outbox를 삭제하지 않는다.
- 서버 `roomSeq`의 확정 cursor 이후를 오름차순 100개씩 반복 조회해 50개 초과 누락을 복원한다. cursor는 사용자·프로필·방별로 저장하고, 실시간/재전송/조회 겹침은 sender+client ID와 roomSeq로 중복 제거·정렬한다.
- 최초/evicted cursor는 임의의 cache row를 연속 동기화 증거로 사용하지 않고 권위 있는 최신 50건을 bounded baseline으로 commit한다. 서버 lifetime 전체를 첫 진입에 읽어 렌더·메모리가 무한 증가하지 않게 하고, 이후에는 영속 cursor부터 최대 1,000건씩 연속 복구한다.
- HTTP 조회가 진행되는 동안 cache에 새로 들어온 optimistic/ack/realtime row를 commit 직전 다시 합친다. 기존에 확정됐으나 서버 최신 창에서 빠진 행은 `delete for me`일 수 있어 되살리지 않는다.
- 최신 창이 catch-up의 마지막 순번보다 앞서 나간 것이 확인되면, catch-up이 빈 페이지를 반환했더라도 1초 뒤 다음 bounded pass를 예약해 두 독립 HTTP snapshot 사이의 순번 구간을 채운다.
- 재실시간 연결은 한 generation만 유지하고 ticket deadline, visibility/online/AppState, 지수 backoff를 적용한다. 복구 직후 과거 타이핑/presence를 몰아 보내지 않는다.
- 타이핑/presence는 짧은 deadline, single-flight, 최소 간격, stale drop을 사용하며 자기 타이핑 echo를 제거했다.
- 진단은 입력 이벤트→React 반영, 메시지 전송 pending/ack, 수신 이벤트 지연, composer/bubble/avatar/sticker/image 렌더, listener/timer, 가능한 런타임의 heap/DOM 추세를 각각 bounded 표본으로 수집한다. 타이핑 비활성, 단순 아바타, 정적 스티커 A/B 스위치를 제공한다.

**테스트와 지표**

- 저장 후 응답 유실 재전송이 화면 한 건으로 수렴, 237개 cursor 복구, realtime/catch-up 중첩 정렬, cursor cold reload, 조회 중 optimistic/ack commit 경합, 최신/catch-up snapshot gap continuation, outbox 상한/재시도/lease, realtime generation/deadline을 단위 테스트했다.
- 장시간 iPhone 수치의 수정 전 baseline과 수정 후 비교 표본은 아직 없다. 계측 코드가 생긴 것을 성능 개선 통과로 해석하지 않는다.

**남은 위험 / 롤백**

- 실제 PostgreSQL 응답 유실 fault injection과 50개 초과 종단 복구는 CI/스테이징에서 추가 실행해야 한다.
- AsyncStorage/localStorage의 메시지 본문은 정상 로그아웃 시 즉시 삭제되지만 로그인 상태·강제 종료 뒤에는 최대 24시간 평문이다. 계정 namespace 분리와 retention sweep은 무기한 잔류를 막지만, 보존 기간 안의 기기 탈취·동일 기기 접근 위험이나 저장 매체 수준의 보안 삭제 요구를 해결하지 않는다.
- 롤백 시 새 서버는 clientMessageId/afterSeq를 하위 호환으로 유지할 수 있다. 구 PWA로 되돌리면 outbox/cursor 복구 기능은 비활성화되므로 장애 메시지를 먼저 내보내거나 보관 정책을 안내한다.

### 6. 계정·프로필 격리와 푸시 소유권

**근거**

- 활성 캐릭터나 로그인 계정이 바뀌는 동안 이전 비동기 응답, query cache, push credential이 새 문맥으로 넘어갈 수 있는 실제 순서 경합이 있었다.

**수정 파일**

- `lib/api-client-react/src/custom-fetch.ts`
- `artifacts/mobile/hooks/useCharacterProfiles.ts`
- `artifacts/mobile/lib/profileQueryIsolation.ts`
- `artifacts/mobile/lib/pushRegistrationCoordinator.ts`
- `artifacts/mobile/lib/pushOwnership.ts`
- `artifacts/mobile/lib/nativePushOwner.ts`
- `artifacts/mobile/components/PushRegistrar.tsx`
- `artifacts/mobile/components/NativePushRegistrar.tsx`
- `artifacts/mobile/app/settings/notifications.tsx`
- `artifacts/mobile/public/sw.js`
- `artifacts/mobile/public/sw-push-owner-policy.js`
- `artifacts/api-server/src/lib/pushOwnershipPolicy.ts`
- `artifacts/api-server/src/lib/push.ts`
- `artifacts/api-server/src/lib/fcm.ts`
- `artifacts/api-server/src/routes/users.ts`
- `lib/api-spec/openapi.yaml` 및 생성 코드

**변경 동작**

- 공통 fetch는 요청 시작 시 auth/profile generation을 캡처하고, 토큰 대기·응답 파싱 전후에 문맥이 바뀌면 결과를 새 cache에 전달하지 않는다. 프로필 A에서 시작한 요청은 A header를 유지하되 B로 전환된 뒤 성공으로 commit할 수 없다.
- 서버 refetch가 활성 프로필 A→B를 반환해도 B request context를 먼저 설치하고 A-scoped query를 cancel/remove한 다음 프로필 응답을 commit한다. 세션 자체가 바뀌면 QueryClient를 폐기한다.
- Web endpoint/FCM token 등록은 credential별 PostgreSQL advisory lock과 정렬된 row lock 안에서 모든 이전 소유자에게서 제거하고 현재 사용자 한 명에게만 재귀속한다. DELETE는 멱등이며 인증된 현재 소유자 행만 제거한다.
- 클라이언트 등록은 기기별 직렬 queue와 owner generation을 사용한다. 이미 전송된 A 등록 뒤에는 B 등록이 반드시 실행되고, 로그아웃 revoke는 진행 중 등록 뒤에 실행된다. revoke 준비가 멈춰도 10초 deadline 뒤 B 등록 queue를 해제한다.
- 알림 설정 화면은 사용자 동작 시작 시 owner generation을 고정하고 permission/token/refetch 각 await 뒤 검증한다. A 화면의 늦은 continuation은 B의 알림 설정이나 credential을 변경하지 않는다.
- PWA service worker는 24시간 owner lease를 저장하고 앱이 visible일 때와 6시간 주기로 갱신한다. payload의 서버 지정 `recipientUserId`가 현재 owner와 다르거나 lease가 없으면 알림 표시·탭 이동·data broadcast를 모두 거부하며 계정 전환 때 기존 알림도 닫는다.
- native owner도 v2 `{version, ownerId, refreshedAt, expiresAt}` 24시간 lease로 저장하고 6시간 및 foreground 복귀 시 갱신한다. legacy 문자열·손상·만료 record는 fail-closed이며, 늦은 A cleanup은 현재 B lease를 지울 수 없다. incoming/terminal call handler는 이 lease와 서버 지정 `recipientUserId`를 대조한다.
- 서버 전송 로그는 token, endpoint, 원문 error/stack/cause를 남기지 않고 허용된 name/code/status/count만 남긴다.

**테스트와 지표**

- A 등록 지연→B 전환→최종 B, 시작 전 stale 작업 skip, A 등록 지연→로그아웃→최종 revoke, A cleanup이 B를 무효화하지 않음, cleanup hang deadline 후 B 진행을 순서 테스트했다.
- PWA owner 일치/불일치/누락/lease 만료 fail-closed, native v2 lease의 6시간 갱신·24시간 만료·legacy 거부·A/B 조건부 clear, 서버 credential 재귀속 정책을 단위 테스트했다.
- 실제 PostgreSQL 다중 세션 등록 경합, 실제 FCM/Web Push 제공자 전송, 로그아웃 직전 in-flight push는 아직 종단 검증하지 않았다.

**남은 위험 / 롤백**

- legacy JSON 열 전체 스캔은 정확성용 임시 구현이다. 대규모 운영 전에 정규화·고유 인덱스 migration이 필요하다.
- Android 일반 OS 자동 표시의 이미 대기 중인 payload는 잔여 위험이다. incoming/terminal call은 data-only라 앱 owner 검증을 거친다.
- 문제 발생 시 클라이언트 owner 표시 fence는 유지하고 자동 등록 queue만 이전 구현으로 되돌릴 수 있다. 서버의 exclusive rebind/멱등 revoke는 하위 호환이므로 유지하는 편이 안전하다.

### 7. HTTP/3·PWA 캐시

**근거**

- UDP 443이 없는 상태에서 HTTP/3가 광고됐다. 부분 설치 캐시가 생기면 구/신 번들이 섞일 위험이 있었다.

**수정 파일**

- `docker/Caddyfile`
- `artifacts/mobile/public/sw.js`
- `artifacts/mobile/public/sw-cache-policy.js`
- `artifacts/mobile/scripts/build.js`

**변경 동작**

- 검증 전에는 Caddy를 HTTP/1.1·HTTP/2로 한정하고 `Alt-Svc: clear`를 보낸다. 이는 TURN/TLS 미디어 포트와 별개다.
- PWA 앱 셸은 staging cache에 필수 자산을 모두 검증한 뒤 버전 cache로 승격한다. 실패한 설치는 현재 worker/cache를 유지한다.
- navigation은 6초 network-first와 검증된 이전 앱 셸 fallback을 사용하고 API·인증은 캐시하지 않는다. 현재와 직전 2개 버전을 보존하되, 현재 worker 이후에 생성된 미확정 cache는 삭제/조회하지 않는다.

**테스트와 지표**

- 앱 셸 cache 보존/미래 cache 격리/부분 설치 실패/필수 자산 검증을 단위 테스트했다.
- 변경 전 유선 HTTP/1 health 표본은 약 0.053~0.073초였으나 통신사/HTTP 버전 비교로 사용할 수 없다. HTTP/2 확인 표본도 로컬 경로 변동이 커 셀룰러 근거가 아니다.

**남은 위험 / 롤백**

- 장시간 열린 탭이 두 번을 초과한 빠른 릴리스 뒤 offline 복귀하는 극단 경로는 추가 시험이 필요하다.
- 향후 HTTP/3를 다시 켤 때 UDP 443 Docker publish, 호스트 방화벽, 클라우드 보안그룹, 실제 외부 QUIC 연결을 같은 변경으로 검증한다.
- 롤백은 이전 Caddy/PWA 정적 빌드로 복귀하고, 브라우저에는 versioned cache를 두어 현재 세션을 보호한다.

### 8. 링크 미리보기 네트워크 경계

**근거와 변경**

- `linkPreview.ts`의 자동 redirect를 제거하고 `linkPreviewNetwork.ts`에서 매 hop마다 URL scheme/port를 검사한다. DNS A/AAAA 전체가 공인 주소인지 확인한 뒤 실제 socket을 그 검증된 주소에 고정하고 원 Host/SNI만 유지한다. 연결 재사용은 끄고 redirect 4회, 전체 2.5초, HTML 1 MiB로 제한하며 fragment를 저장하지 않는다.
- literal/redirect 대상의 loopback, RFC1918, link-local, CGNAT, metadata, IPv4-mapped IPv6 및 혼합 public/private DNS 답변을 fail-closed 처리한다.
- 수신자 기기가 제3자 OG 이미지 URL을 직접 요청하지 않도록 신규 저장, 기존 DB 응답 직렬화, client stale cache 렌더 세 지점에서 `imageUrl`을 `null`로 강제한다. 링크 카드의 title/description과 사용자가 직접 누른 원문 링크 열기는 유지한다.

**테스트와 잔여 위험 / 롤백**

- 실제 local HTTP handler를 띄운 테스트에서 literal loopback과 public→private redirect 모두 내부 handler hit 0건이었고, DNS pinning/혼합 답변/대체 IP 표기를 검증했다. 별도 server/client thumbnail 정책 테스트는 신규·기존·stale URL이 모두 null임을 확인했다.
- 썸네일을 되살리는 롤백은 수신자 IP/UA와 사설망 요청 위험을 다시 연다. 장애 롤백이 필요하면 preview title/description까지 비활성화하고 과거 auto-follow 또는 직접 image fetch 구현으로는 되돌리지 않는다.

### 9. 배포 안전장치

**변경 동작**

- 배포는 Caddy validate→읽기 전용 DB readiness→제한 timeout migration 순서이며 1 GiB 이상 relation이나 active/ringing call이 있으면 명시 승인 없이는 중단한다.
- 현재 API/PWA source와 immutable image digest를 기록하고 새 PWA 구조를 검증한다. 실패 rollback은 이전 image/PWA source 복귀와 내부·외부 health를 확인하며 불완전하면 명시적으로 실패한다.

**확인된 잔여 배포 위험**

- app-a/app-b의 전진 교체와 rollback이 아직 한 Compose 명령에서 동시에 일어나며, 단일 proxy/PWA bind 전환도 짧은 중단 가능성이 있다.
- readiness는 순간 snapshot이라 검사 종료와 DDL 시작 사이 새 통화가 생성되는 TOCTOU가 남는다. 통화 생성 drain/maintenance 또는 공유 DB advisory fence 전에는 무중단 안전성이 증명되지 않는다.
- DB migration은 자동 역변환하지 않는다. 구·신 API의 post-migration 호환성을 확인하지 않고 운영 실행하면 안 된다.
- 따라서 이번 작업에서는 API/PWA rollout을 실행하지 않았고, 이 항목들은 배포 승인과 별도의 운영 유지보수 절차가 필요하다.

## 요구 실패 시나리오 판정

| 시나리오 | 자동 검증 | 실제 환경 검증 | 현재 판정 |
|---|---|---|---|
| 서버 저장 후 응답만 유실, 재전송 1회 저장/표시 | client merge·서버 멱등 규칙 단위 테스트 | 실제 PostgreSQL fault injection 미실행 | 부분 검증 |
| 단절 중 50개 초과 후 누락·중복 없는 복원 | 237개 pagination/merge 테스트 | PWA cold reload+실서버 미실행 | 부분 검증 |
| 통화 중 Wi-Fi↔셀룰러 반복 전환 | generation/rejoin 정책 단위 테스트 | 실기기/통신사 미실행 | 미검증 |
| 카메라 지연·거부·끄기에도 가능한 음성 유지 | 미디어 분류 단위 테스트 | iPhone/Android 종단 통화 미실행 | 부분 검증 |
| 종료 유실·앱 강제 종료 후 상태 복구/다음 통화 | 서버 대조 정책·잠금 단위/통합 테스트 작성 | 실제 LiveKit+PostgreSQL chaos 미실행 | 부분 검증 |
| 늦은 통화 A 이벤트가 새 통화 B에 무영향 | callId/attempt fence 단위·통합 테스트 작성 | 실제 동시 경합 미실행 | 부분 검증 |
| UDP 차단망 TURN/TLS와 양방향 오디오 | 없음 | 실망 시험 미실행 | 미검증 |
| iPhone 장시간 채팅/반복 입퇴장 자원 악화 없음 | bounded 정책·cleanup 단위 테스트 | 장시간 실기기 baseline/A-B 미실행 | 미검증 |
| 서버 재시작/재배포 후 통화·메시지 동기화 | 영속 state/outbox/cursor 정책 테스트 | staging restart/rolling deploy 미실행 | 부분 검증 |

실기기 매트릭스의 KT·SKT·LGU+, 지원 iOS 버전, Safari와 설치형 PWA는 모두 아직 미검증이다. 이 항목들은 운영 배포 후 정상 통화 한 건으로 대체할 수 없다.

## 운영 반영 전 게이트

1. 운영 DB read-only readiness probe로 calls/messages 행 수와 relation size를 기록한다.
2. 검증된 DB backup/restore point와 이전 API image digest, 이전 PWA 정적 릴리스를 기록한다.
3. PostgreSQL 16·Redis가 있는 CI에서 마이그레이션과 통합 테스트를 통과시킨다.
4. 생성 파일을 commit한 상태에서 별도 OpenAPI drift workflow를 통과시킨다.
5. LiveKit Cloud webhook URL/서명 구성을 확인한다.
6. API 두 replica의 순차 교체 또는 검증된 롤링 절차로 배포하고, 각 replica health와 schema 호환을 확인한다.
7. Caddy 설정 검증 후 재생성하고 응답의 `Alt-Svc: clear`, HTTP/2, 요청 ID 연결을 확인한다.
8. versioned PWA를 배포하고 신규/기존 worker, offline fallback, 로그인/API 비캐시를 확인한다.
9. 최소 두 계정으로 메시지 응답 유실, 100개 이상 catch-up, 종료 유실, 카메라 거부, 네트워크 전환을 staging 또는 제한된 운영 canary에서 수행한다.
10. 에러율·p95 요청 시간·재연결 횟수·미디어 준비 분류·stale call 정리 시간을 관찰한 뒤 확대한다.

## 운영 롤백 기준

- 마이그레이션 전 실패: 실행 중 컨테이너를 바꾸지 않는다.
- 새 API health/오류율 악화: 이전 immutable digest로 API replica를 복귀한다. 추가 스키마는 즉시 제거하지 않는다.
- PWA 부팅/캐시 오류: 이전 정적 릴리스를 다시 마운트하고 Caddy를 reload한다.
- 통화 세대 충돌 증가: `CALL_ATTEMPT_HEADER_ENFORCE_AFTER`를 해제해 누락 헤더 호환을 임시 복구하되, 잘못된 명시 세대 ID 거부와 callId 잠금 fence는 유지한다.
- Caddy 연결 회귀: 이전 설정으로 복귀할 수 있으나, HTTP/3를 다시 광고하려면 UDP 443 종단 도달성 확인이 선행되어야 한다.
