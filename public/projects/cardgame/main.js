// --- Game Data & State (게임 데이터 및 상태) ---
// 게임의 기본 스탯과 덱 정보를 담고 있는 초기 데이터입니다.
const baseData = {
    player: {
        hp: 20,
        maxHp: 20,
        speed: 3,
        int: 4,
        str: 2,
        cool: 1,
        weapon: { name: '검', power: 4 },
        deckInfo: [
            { id: 'p_swing', name: '휘두르기', type: '공격', dice: 'C1', count: 6 },
            { id: 'p_stab', name: '찌르기', type: '공격', dice: 'D4', count: 6 },
            { id: 'p_dodge', name: '전술 회피', type: '회피', dice: '2D4', isFixed: true, count: 2 }
            // isFixed: true 설정 시, 무기 위력에 상관없이 해당 주사위 공식을 그대로 사용합니다.
        ]
    },
    enemy: {
        hp: 20,
        maxHp: 20,
        speed: 4,
        int: 2,
        str: 3,
        cool: 1,
        weapon: { name: '검', power: 4 },
        deckInfo: [
            { id: 'e_swing', name: '휘두르기', type: '공격', dice: 'C1', count: 6 },
            { id: 'e_stab', name: '찌르기', type: '공격', dice: 'D4', count: 6 },
            { id: 'e_dodge', name: '전술 회피', type: '회피', dice: '2D4', isFixed: true, count: 2 }
        ]
    }
};

// 현재 게임의 진행 상태를 관리하는 객체입니다.
let state = {
    phase: 'planning', // 'planning' (카드 배치 단계) 또는 'animating' (전투 애니메이션 단계)
    player: {
        hp: baseData.player.hp,
        deck: [],           // 현재 덱
        hand: [],           // 현재 손패
        graveyard: [],      // 사용한 카드가 모이는 묘지
        activeDebuffs: {},  // 현재 턴에 적용 중인 통찰 디버프 (카드 이름 기준)
        pendingDebuffs: {}, // 이번 턴에 누적되어 '다음 턴'에 적용될 통찰 디버프
        rail: [],           // 보드에 놓인 레일 상태
        rerollsLeft: 0      // 리롤 남은 횟수
    },
    enemy: {
        hp: baseData.enemy.hp,
        maxHp: baseData.enemy.maxHp,
        deck: [],
        hand: [],
        graveyard: [],
        activeDebuffs: {},
        pendingDebuffs: {},
        rail: []
    },
    railCount: 0, // 양측 중 더 높은 스피드에 의해 결정된 총 레일 칸 수
    turn: 1
};

// 일반 행동의 시스템 영문 명칭을 화면에 표시할 한글 이름으로 매핑합니다.
const ACTION_NAMES = {
    'defenseless': '무방비',
    'guard': '일반 방어',
    'dodge': '일반 회피',
    'insight': '일반 통찰'
};

// --- Initialization (초기화 로직) ---

// 게임을 처음 세팅하고 시작하는 메인 함수입니다.
function initGame() {
    // 1. 양측의 속도(Speed)를 기준으로 레일 개수를 계산합니다. (기본 1칸 + 속도/2)
    const pRailCount = 1 + Math.floor(baseData.player.speed / 2);
    const eRailCount = 1 + Math.floor(baseData.enemy.speed / 2);
    // 레일의 총 길이는 둘 중 더 높은 쪽의 레일 개수를 따릅니다.
    state.railCount = Math.max(pRailCount, eRailCount);

    // 2. 초기 기획 데이터로부터 실제 카드 덱 배열을 생성합니다.
    state.player.deck = buildDeck(baseData.player.deckInfo, 'p');
    state.enemy.deck = buildDeck(baseData.enemy.deckInfo, 'e');

    // 리롤 횟수 초기화 (지능 +2당 1회)
    state.player.rerollsLeft = Math.floor(baseData.player.int / 2);

    // 3. 레일 상태를 초기화하고 속도 차이에 따른 비활성 슬롯을 세팅합니다.
    initRails();

    // 4. 게임 시작 시 카드를 뽑습니다. (템포: 활성화된 레일 개수만큼 드로우)
    drawCards('player', getActiveRailCount('player'));
    drawCards('enemy', getActiveRailCount('enemy'));

    // 화면(UI)을 새로고침하고 적의 패턴을 랜덤으로 설정합니다.
    updateUI();
    renderRails();
    renderHand();
    setupEnemyRandomTurn();
}

// 덱 정보(deckInfo)를 바탕으로 실제 카드 객체들을 복사하여 넣고 랜덤하게 섞어 반환합니다.
function buildDeck(deckInfo, prefix) {
    let deck = [];
    let uid = 0;
    for (let info of deckInfo) {
        for (let i = 0; i < info.count; i++) {
            deck.push({
                uid: `${prefix}_${info.id}_${uid++}`,
                name: info.name,
                type: info.type,
                rawDice: info.dice,
                isFixed: info.isFixed
            });
        }
    }
    // 배열을 랜덤으로 섞습니다 (Shuffle)
    return deck.sort(() => Math.random() - 0.5);
}

// 최대값(max) 내에서 지정된 개수(count)만큼 중복 없이 무작위 인덱스를 뽑아냅니다.
function getRandomIndices(max, count) {
    let arr = [];
    while (arr.length < count) {
        let r = Math.floor(Math.random() * max);
        if (arr.indexOf(r) === -1) arr.push(r);
    }
    return arr;
}

// 레일을 비우고, 속도 차이에 의한 비활성(disabled) 슬롯을 무작위로 설정합니다.
function initRails() {
    // 모든 슬롯을 기본적으로 '무방비' 상태로 초기화합니다.
    state.player.rail = new Array(state.railCount).fill(null).map(() => ({
        type: 'action', action: 'defenseless', card: null, disabled: false
    }));
    state.enemy.rail = new Array(state.railCount).fill(null).map(() => ({
        type: 'action', action: 'defenseless', card: null, disabled: false
    }));

    // 플레이어 속도가 부족할 경우, 부족한 만큼 무작위 슬롯을 비활성화합니다.
    const pRailCount = 1 + Math.floor(baseData.player.speed / 2);
    const pDiff = state.railCount - pRailCount;
    if (pDiff > 0) {
        getRandomIndices(state.railCount, pDiff).forEach(i => state.player.rail[i].disabled = true);
    }

    // 적의 속도가 부족할 경우, 부족한 만큼 무작위 슬롯을 비활성화합니다.
    const eRailCount = 1 + Math.floor(baseData.enemy.speed / 2);
    const eDiff = state.railCount - eRailCount;
    if (eDiff > 0) {
        getRandomIndices(state.railCount, eDiff).forEach(i => state.enemy.rail[i].disabled = true);
    }
}

// 특정 대상(player/enemy)의 비활성화되지 않은(정상 작동하는) 레일 개수를 반환합니다.
function getActiveRailCount(who) {
    return Math.max(1, state[who].rail.filter(r => !r.disabled).length);
}

// 덱에서 지정된 장수(amount)만큼 핸드로 카드를 이동시킵니다. (핸드 최대 20장 제한)
function drawCards(who, amount) {
    for (let i = 0; i < amount; i++) {
        if (state[who].deck.length > 0 && state[who].hand.length < 20) {
            state[who].hand.push(state[who].deck.pop());
        }
    }
}

// --- Dice & Damage System (주사위 및 데미지 시스템) ---

// 무기의 위력을 카드 주사위 단위(D4, C1 등)로 나누어 실제 주사위 공식 문자열을 만듭니다.
// 디버프(통찰 차감)가 있다면 최종 수식 뒤에 `- X` 형태로 표기합니다.
function calcCardDamageString(power, rawDice, isFixed, debuffAmount = 0) {
    let baseStr = '';

    if (isFixed) {
        // 전술 회피처럼 고정된 수식(2D4)을 사용하는 경우 위력 계산을 무시합니다.
        baseStr = rawDice;
    } else {
        const diceTypes = rawDice.split(',').map(s => s.trim());
        let remain = power;
        const res = [];

        // 기획서: 무기 위력에서 주사위 최댓값만큼 채우고 남는 자투리 위력은 버림 처리합니다.
        for (let dStr of diceTypes) {
            if (remain <= 0) break;
            let maxVal = 0;
            let typeStr = dStr;
            if (dStr === 'C' || dStr === 'C1') {
                maxVal = 1;
                typeStr = 'C';
            } else if (dStr.startsWith('D')) {
                maxVal = parseInt(dStr.substring(1));
            }

            if (maxVal > 0) {
                const count = Math.floor(remain / maxVal);
                if (count > 0) {
                    res.push(`${count}${typeStr}`);
                    remain -= count * maxVal;
                }
            }
        }
        baseStr = res.length > 0 ? res.join(' + ') : '0';
    }

    // 통찰 등으로 깎인 수치가 있다면 화면에 표시하기 위해 문자열을 덧붙입니다.
    if (debuffAmount > 0) {
        return `${baseStr} - ${debuffAmount}`;
    }
    return baseStr;
}

// 문자열로 된 주사위 공식(예: "1D12 + 2D4 - 1")을 파싱하여 실제로 랜덤 숫자를 굴립니다.
function rollDice(diceStr) {
    if (!diceStr || diceStr === '0') return 0;

    let subPart = 0;
    // 디버프가 적용되어 문자열에 ' - ' 가 포함되어 있는지 확인합니다.
    if (diceStr.includes(' - ')) {
        const split = diceStr.split(' - ');
        diceStr = split[0];
        subPart = parseInt(split[1]);
    }

    // '+' 기호로 주사위 묶음들을 분리합니다.
    const parts = diceStr.split('+').map(s => s.trim());
    let total = 0;
    for (const part of parts) {
        const match = part.match(/(\d+)(D\d+|C)/);
        if (match) {
            const count = parseInt(match[1]);
            const type = match[2];
            let maxVal = type.startsWith('D') ? parseInt(type.substring(1)) : 1;

            // count 개수만큼 주사위를 굴립니다.
            for (let i = 0; i < count; i++) {
                if (type === 'C') {
                    total += Math.floor(Math.random() * 2); // 0 또는 1
                } else {
                    total += Math.floor(Math.random() * maxVal) + 1;
                }
            }
        }
    }
    // 디버프(subPart)를 차감하되, 최종 데미지가 0 미만이 되지 않게 보정합니다.
    return Math.max(0, total - subPart);
}

// --- Rendering (화면 렌더링) ---

// 양측의 체력바, 스탯(SPD, INT, STR, COL), 덱 남은 장수 등을 갱신합니다.
function updateUI() {
    document.getElementById('player-hp-text').innerText = `${state.player.hp} / ${baseData.player.maxHp}`;
    document.getElementById('enemy-hp-text').innerText = `${state.enemy.hp} / ${baseData.enemy.maxHp}`;

    document.getElementById('player-hp-bar').style.width = `${(state.player.hp / baseData.player.maxHp) * 100}%`;
    document.getElementById('enemy-hp-bar').style.width = `${(state.enemy.hp / baseData.enemy.maxHp) * 100}%`;

    document.getElementById('deck-count').innerText = state.player.deck.length;
    const eDeckCountEl = document.getElementById('enemy-deck-count');
    if (eDeckCountEl) eDeckCountEl.innerText = state.enemy.deck.length;

    const pRerollCountEl = document.getElementById('p-reroll-count');
    if (pRerollCountEl) pRerollCountEl.innerText = state.player.rerollsLeft;

    // Stats UI 업데이트
    document.getElementById('p-spd').innerText = baseData.player.speed;
    document.getElementById('p-int').innerText = baseData.player.int;
    document.getElementById('p-str').innerText = baseData.player.str;
    document.getElementById('p-col').innerText = baseData.player.cool;

    document.getElementById('e-spd').innerText = baseData.enemy.speed;
    document.getElementById('e-int').innerText = baseData.enemy.int;
    document.getElementById('e-str').innerText = baseData.enemy.str;
    document.getElementById('e-col').innerText = baseData.enemy.cool;
}

// 카드 데이터를 받아와 브라우저에 표시할 HTML 문자열로 변환합니다.
function createCardHTML(card, isEnemyHidden = false, owner = 'player') {
    if (!card) return '';
    // 적의 카드가 뒤집혀 있는 상태일 때의 처리
    if (isEnemyHidden) {
        return `<div class="card enemy-hidden" data-uid="${card.uid}"></div>`;
    }

    // 카드를 보유한 쪽의 무기 위력을 가져옵니다.
    const power = card.uid.startsWith('p_') ? baseData.player.weapon.power : baseData.enemy.weapon.power;
    // 지난 턴에 발생하여 이번 턴에 유효한 통찰 디버프를 가져옵니다. 카드의 '이름(card.name)'을 기준으로 추적합니다.
    const debuffAmount = state[owner].activeDebuffs[card.name] || 0;

    // 데미지 공식을 계산하여 문자열을 가져옵니다.
    const dmgStr = calcCardDamageString(power, card.rawDice, card.isFixed, debuffAmount);

    return `
        <div class="card" draggable="true" data-uid="${card.uid}" data-type="${card.type}">
            <div class="card-type">${card.type}</div>
            <div class="card-title">${card.name}</div>
            <div class="card-damage">${dmgStr}</div>
        </div>
    `;
}

// 내 핸드에 있는 카드들을 하단 영역에 렌더링하고, 드래그 이벤트를 부여합니다.
function renderHand() {
    const handContainer = document.getElementById('player-hand');
    handContainer.innerHTML = state.player.hand.map(card => {
        const html = createCardHTML(card, false, 'player');
        return html.replace('class="card"', 'class="card in-hand" id="card-' + card.uid + '"');
    }).join('');

    // 드래그 앤 드롭 세팅
    document.querySelectorAll('#player-hand .card').forEach(el => {
        el.addEventListener('dragstart', (e) => {
            if (state.phase !== 'planning') {
                e.preventDefault();
                return;
            }
            e.dataTransfer.setData('text/plain', el.dataset.uid);
            setTimeout(() => el.style.opacity = '0.5', 0);
        });
        el.addEventListener('dragend', (e) => {
            el.style.opacity = '1';
        });
    });

    // --- 적 핸드 (뒷면) ---
    const enemyHandContainer = document.getElementById('enemy-hand');
    if (enemyHandContainer) {
        // 핸드 장수만큼 뒷면 카드를 추가합니다.
        enemyHandContainer.innerHTML = state.enemy.hand.map(() => {
            return `<div class="card enemy-hidden in-hand"></div>`;
        }).join('');
    }
}

// 게임 보드 중앙의 레일(슬롯)들을 렌더링하고 클릭/드롭 이벤트를 부여합니다.
function renderRails() {
    const pRailEl = document.getElementById('player-rail');
    const eRailEl = document.getElementById('enemy-rail');

    pRailEl.innerHTML = '';
    eRailEl.innerHTML = '';

    for (let i = 0; i < state.railCount; i++) {
        // --- 플레이어 레일 처리 ---
        const pSlot = document.createElement('div');
        pSlot.className = 'slot player-slot';
        if (state.player.rail[i].disabled) pSlot.classList.add('disabled-slot');
        pSlot.dataset.index = i;

        const pState = state.player.rail[i];
        if (pState.type === 'card' && pState.card) {
            let html = createCardHTML(pState.card, false, 'player');
            html = html.replace('class="card"', 'class="card in-slot" draggable="false"');
            pSlot.innerHTML = html;
        } else {
            pSlot.innerHTML = `<div class="base-action-text">${ACTION_NAMES[pState.action]}</div>`;
        }

        // 드롭 구역 이벤트
        pSlot.addEventListener('dragover', e => {
            if (state.phase !== 'planning' || pState.disabled) return;
            e.preventDefault();
            pSlot.classList.add('drag-over');
        });
        pSlot.addEventListener('dragleave', e => {
            pSlot.classList.remove('drag-over');
        });
        pSlot.addEventListener('drop', e => {
            pSlot.classList.remove('drag-over');
            if (state.phase !== 'planning' || pState.disabled) return;
            const uid = e.dataTransfer.getData('text/plain');
            placeCardOnRail(uid, i);
        });

        // 슬롯 클릭 (카드 회수 또는 일반 행동 메뉴 열기)
        pSlot.addEventListener('click', e => {
            if (state.phase !== 'planning') return;
            if (pState.type === 'card') {
                returnCardToHand(i);
            } else {
                showContextMenu(e.pageX, e.pageY, i, pState.disabled);
            }
        });

        pRailEl.appendChild(pSlot);

        // --- 적 레일 처리 ---
        const eSlot = document.createElement('div');
        eSlot.className = 'slot enemy-slot';
        if (state.enemy.rail[i].disabled) eSlot.classList.add('disabled-slot');
        eSlot.id = `e-slot-${i}`;

        const eState = state.enemy.rail[i];
        if (eState.type === 'card' && eState.card) {
            // planning 페이즈에서는 적 카드는 뒷면(?)으로 가려집니다.
            let html = createCardHTML(eState.card, state.phase === 'planning', 'enemy');
            html = html.replace('class="card', 'class="card in-slot');
            eSlot.innerHTML = html;
        } else {
            if (state.phase === 'planning') {
                eSlot.innerHTML = `<div class="base-action-text">?</div>`;
            } else {
                eSlot.innerHTML = `<div class="base-action-text">${ACTION_NAMES[eState.action]}</div>`;
            }
        }
        eRailEl.appendChild(eSlot);
    }
}

// --- Interactions (상호작용) ---

// 핸드의 카드를 특정 레일 슬롯에 배치합니다.
function placeCardOnRail(uid, slotIndex) {
    const cardIdx = state.player.hand.findIndex(c => c.uid === uid);
    if (cardIdx === -1) return;

    const card = state.player.hand[cardIdx];

    // 슬롯에 이미 다른 카드가 있다면 다시 핸드로 돌려보냅니다.
    if (state.player.rail[slotIndex].type === 'card') {
        state.player.hand.push(state.player.rail[slotIndex].card);
    }

    state.player.rail[slotIndex] = { type: 'card', card: card };
    state.player.hand.splice(cardIdx, 1);

    renderHand();
    renderRails();
}

// 레일에 올려둔 카드를 클릭하여 다시 핸드로 회수합니다.
function returnCardToHand(slotIndex) {
    const item = state.player.rail[slotIndex];
    if (item.type === 'card' && item.card) {
        state.player.hand.push(item.card);
        state.player.rail[slotIndex] = { type: 'action', action: 'defenseless', card: null, disabled: state.player.rail[slotIndex].disabled };
        renderHand();
        renderRails();
    }
}

// --- 일반 행동 컨텍스트 메뉴 처리 ---
const menu = document.getElementById('action-menu');
let activeSlotIndex = -1;

function showContextMenu(x, y, index, isDisabled) {
    activeSlotIndex = index;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // 기획 수정 반영: 비활성 레일이더라도 일반 행동 4가지는 모두 열람 및 선택 가능합니다.
    const insightItem = menu.querySelector('[data-action="insight"]');
    if (insightItem) {
        insightItem.style.display = 'block';
    }

    menu.classList.remove('hidden');
}

document.addEventListener('click', e => {
    // 메뉴 바깥을 클릭하면 닫히도록 설정
    if (!e.target.closest('#action-menu') && !e.target.closest('.player-slot')) {
        menu.classList.add('hidden');
    }
});

// 메뉴의 아이템(무방비, 일반방어 등)을 클릭했을 때의 로직
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (activeSlotIndex !== -1) {
            state.player.rail[activeSlotIndex] = {
                type: 'action',
                action: action,
                card: null,
                disabled: state.player.rail[activeSlotIndex].disabled
            };
            renderRails();
        }
        menu.classList.add('hidden');
    });
});

// --- Enemy Logic (적 AI) ---

// 적이 정해진 패턴에 따라 행동을 결정합니다.
function setupEnemyRandomTurn() {
    // 기획서 141항: 상대 패턴
    // 1. [휘두르기, 회피, 찌르기]
    // 2. [회피, 회피, 회피]
    // 3. [찌르기, 찌르기, 통찰]
    const patterns = [
        ['휘두르기', '전술 회피', '찌르기'],
        ['전술 회피', '전술 회피', '전술 회피'],
        ['찌르기', '찌르기', 'insight']
    ];

    // 패턴을 무작위로 하나 선택합니다.
    const selectedPattern = patterns[Math.floor(Math.random() * patterns.length)];

    let availableHand = [...state.enemy.hand];
    let plannedSlots = [];
    let patternFailed = false;

    // 선택된 패턴을 구성할 수 있는지 확인합니다.
    for (let req of selectedPattern) {
        if (req === 'insight') {
            plannedSlots.push({ type: 'action', action: 'insight', card: null, disabled: false });
        } else {
            // 핸드에 해당 이름이 포함된 카드가 있는지 찾습니다.
            const idx = availableHand.findIndex(c => c.name.includes(req));
            if (idx !== -1) {
                plannedSlots.push({ type: 'card', card: availableHand[idx], disabled: false });
                availableHand.splice(idx, 1); // 사용한 카드는 임시 핸드에서 제거
            } else {
                // 4. 해당하는 카드가 핸드에 없을 경우
                patternFailed = true;
                break;
            }
        }
    }

    // 카드가 부족해서 패턴이 실패했다면 전부 일반 회피로 통일합니다.
    if (patternFailed) {
        plannedSlots = [];
        availableHand = [...state.enemy.hand]; // 핸드 복구 (카드 사용 안 함)
    }

    let patternIdx = 0;
    for (let i = 0; i < state.railCount; i++) {
        // 비활성 레일에는 아무것도 놓지 못합니다.
        if (state.enemy.rail[i].disabled) continue;

        if (!patternFailed && patternIdx < plannedSlots.length) {
            // 패턴대로 배치 (부족하면 뒷부분은 자연스럽게 잘림 - 6번 규칙 충족)
            state.enemy.rail[i] = plannedSlots[patternIdx];
        } else {
            // 5. 레일에 놓을 카드가 많을 경우 남는 공백은 일반 회피로 변경
            // (패턴이 실패했을 때 '전부 일반 회피로' 규칙도 여기서 같이 충족됨)
            state.enemy.rail[i] = {
                type: 'action',
                action: 'dodge',
                card: null,
                disabled: false
            };
        }
        patternIdx++;
    }

    // 실제로 사용된 카드를 핸드에서 제거 반영
    state.enemy.hand = availableHand;

    renderRails();
}

// --- Battle Logic (전투 애니메이션 및 판정 로직) ---

// '전투 시작' 버튼 클릭 이벤트
document.getElementById('start-btn').addEventListener('click', () => {
    if (state.phase !== 'planning') return;
    state.phase = 'animating';
    document.getElementById('start-btn').disabled = true;

    // 1. 적의 엎어둔 카드를 화면에 모두 공개합니다. 
    // (이때 통찰 디버프 수치인 '1D4 - 1' 같은 텍스트가 시각적으로 표시됩니다)
    renderRails();

    // 2. 유저가 공개된 결과와 디버프 텍스트를 읽을 수 있도록 1초(1000ms) 대기 후 레일 전투를 시작합니다.
    setTimeout(() => processRail(0), 1000);
});

// 데미지나 시스템 메시지 팝업을 해당 요소(카드) 위에 띄웁니다.
// offsetY 매개변수를 이용해 텍스트가 겹치지 않게 조절할 수 있습니다.
function spawnDamagePopup(element, text, color, offsetY = 0) {
    const rect = element.getBoundingClientRect();
    const overlay = document.getElementById('animation-overlay');
    const popup = document.createElement('div');
    popup.className = 'dmg-popup';
    popup.style.left = `${rect.left + rect.width / 2 - 20}px`;
    popup.style.top = `${rect.top + offsetY}px`;
    popup.style.color = color;
    popup.innerText = text;
    overlay.appendChild(popup);
    // 애니메이션 길이에 맞춰 1.5초 후 팝업 요소를 DOM에서 지웁니다.
    setTimeout(() => popup.remove(), 1500);
}

// 0번 레일부터 순차적으로 진행되는 전투 애니메이션 제어기
function processRail(index) {
    if (index >= state.railCount) {
        // 모든 레일을 순회했다면 0.5초 대기 후 턴 종료(endTurn)를 실행합니다.
        setTimeout(() => {
            endTurn();
        }, 500);
        return;
    }

    const pSlots = document.querySelectorAll('.player-slot');
    const eSlots = document.querySelectorAll('.enemy-slot');

    const pEl = pSlots[index];
    const eEl = eSlots[index];

    // 현재 전투 중인 슬롯에 시각적 하이라이트 효과를 부여합니다.
    pEl.classList.add('active-combat');
    eEl.classList.add('active-combat');

    // 잠깐(200ms) 하이라이트 상태를 보여준 뒤 실제 주사위 굴림 및 데미지 계산으로 진입합니다.
    setTimeout(() => {
        resolveCombat(index, pEl, eEl, () => {
            // resolveCombat 내부 비동기(주사위 굴림) 작업이 끝나면 호출되는 콜백입니다.
            setTimeout(() => {
                pEl.classList.remove('active-combat');
                eEl.classList.remove('active-combat');
                updateUI();

                // 체력이 0 이하인지 체크 (승패 판정)
                if (state.player.hp <= 0 || state.enemy.hp <= 0) {
                    alert(state.player.hp <= 0 ? "패배했습니다!" : "승리했습니다!");
                    location.reload();
                    return;
                }

                // 다음 레일 슬롯을 처리하도록 재귀 호출합니다.
                processRail(index + 1);
            }, 600); // 팝업 결과를 읽을 여유를 줍니다.
        });
    }, 200);
}

// 주사위 굴림을 연출하는 시각적 애니메이션 (숫자가 빠르게 랜덤하게 변함)
function animateDiceRoll(element, finalValue, color, callback) {
    if (!element) {
        if (callback) callback();
        return;
    }
    const dmgEl = element.querySelector('.card-damage') || element.querySelector('.base-action-text');
    if (!dmgEl) {
        if (callback) callback();
        return;
    }

    let startTime = Date.now();
    let duration = 400; // 0.4초 동안 숫자가 롤링됩니다.

    let interval = setInterval(() => {
        let elapsed = Date.now() - startTime;
        if (elapsed > duration) {
            // 애니메이션이 끝나면 실제 데미지 최종값(finalValue)을 쾅 하고 표시합니다.
            clearInterval(interval);
            dmgEl.innerText = finalValue;
            dmgEl.style.color = color;
            dmgEl.style.transform = 'scale(1.5)';
            setTimeout(() => dmgEl.style.transform = 'scale(1)', 150);
            if (callback) callback();
        } else {
            // 진행 중에는 1~20 사이의 숫자를 막 띄워 긴장감을 유도합니다.
            dmgEl.innerText = Math.floor(Math.random() * 20) + 1;
        }
    }, 40);
}

// 슬롯 대 슬롯의 데미지 공방을 계산하고 체력을 차감하는 핵심 로직
function resolveCombat(index, pEl, eEl, callback) {
    const pItem = state.player.rail[index];
    const eItem = state.enemy.rail[index];

    let pRoll = 0, eRoll = 0;
    let pType = pItem.type === 'card' ? pItem.card.type : 'action';
    let eType = eItem.type === 'card' ? eItem.card.type : 'action';

    let pendingAnimations = 0;

    // 플레이어가 카드를 냈다면 주사위를 굴립니다. (디버프가 있다면 자동 차감됩니다)
    if (pItem.type === 'card') {
        const debuff = state.player.activeDebuffs[pItem.card.name] || 0;
        const dmgStr = calcCardDamageString(baseData.player.weapon.power, pItem.card.rawDice, pItem.card.isFixed, debuff);
        pRoll = rollDice(dmgStr);
        pendingAnimations++;
        animateDiceRoll(pEl, pRoll, '#3b82f6', () => {
            pendingAnimations--;
            checkAnimationsDone();
        });
    }

    // 적이 카드를 냈다면 주사위를 굴립니다.
    if (eItem.type === 'card') {
        const debuff = state.enemy.activeDebuffs[eItem.card.name] || 0;
        const dmgStr = calcCardDamageString(baseData.enemy.weapon.power, eItem.card.rawDice, eItem.card.isFixed, debuff);
        eRoll = rollDice(dmgStr);
        pendingAnimations++;
        animateDiceRoll(eEl, eRoll, '#ef4444', () => {
            pendingAnimations--;
            checkAnimationsDone();
        });
    }

    // 양측 다 카드를 내지 않았을 경우(양쪽 일반 행동)를 대비한 체크
    if (pendingAnimations === 0) {
        checkAnimationsDone();
    }

    // 주사위 롤링 애니메이션이 모두 끝난 직후에 불리는 공방 계산부
    function checkAnimationsDone() {
        if (pendingAnimations > 0) return;

        let pDmgTaken = 0;
        let eDmgTaken = 0;

        // 1. 카드 vs 카드 (공격 vs 공격 비교)
        if (pType === '공격' && eType === '공격') {
            if (pRoll > eRoll) {
                eDmgTaken = pRoll - eRoll; // 주사위가 높은 쪽이 차이만큼 데미지를 줍니다.
            } else if (eRoll > pRoll) {
                pDmgTaken = eRoll - pRoll;
            }
        }
        // 2. 카드 vs 일반행동/회피/방어 계산
        else {
            // --- 플레이어가 카드를 내고 적이 대응할 때 ---
            if (pType === '공격' || pType === '방어' || pType === '회피') {
                if (eType === 'action') {
                    if (eItem.action === 'defenseless') {
                        if (pType === '공격') eDmgTaken = pRoll;
                    }
                    else if (eItem.action === 'guard') {
                        if (pType === '공격') eDmgTaken = Math.max(1, pRoll - baseData.enemy.str);
                    }
                    else if (eItem.action === 'dodge') {
                        if (pType === '공격') eDmgTaken = pRoll > baseData.enemy.speed ? pRoll : 0;
                    }
                    else if (eItem.action === 'insight') {
                        // 통찰: 데미지는 그대로 받고, 카드의 주사위값 기반으로 디버프 적립
                        if (pType === '공격') eDmgTaken = pRoll;

                        const deduction = Math.min(pRoll, baseData.enemy.int);
                        if (deduction > 0) {
                            state.player.pendingDebuffs[pItem.card.name] = (state.player.pendingDebuffs[pItem.card.name] || 0) + deduction;
                            spawnDamagePopup(eEl, `통찰! (-${deduction})`, '#a855f7', -30);
                        } else {
                            spawnDamagePopup(eEl, `통찰!`, '#a855f7', -30);
                        }
                    }
                } else if (eType === '회피') {
                    if (pType === '공격') eDmgTaken = pRoll > eRoll ? pRoll : 0;
                } else if (eType === '방어') {
                    if (pType === '공격') eDmgTaken = Math.max(0, pRoll - eRoll);
                }
            }

            // --- 적이 카드를 내고 플레이어가 대응할 때 ---
            if (eType === '공격' || eType === '방어' || eType === '회피') {
                if (pType === 'action') {
                    if (pItem.action === 'defenseless') {
                        if (eType === '공격') pDmgTaken = eRoll;
                    }
                    else if (pItem.action === 'guard') {
                        if (eType === '공격') pDmgTaken = Math.max(1, eRoll - baseData.player.str);
                    }
                    else if (pItem.action === 'dodge') {
                        if (eType === '공격') pDmgTaken = eRoll > baseData.player.speed ? eRoll : 0;
                    }
                    else if (pItem.action === 'insight') {
                        // 통찰: 데미지는 그대로 받고, 카드의 주사위값 기반으로 디버프 적립
                        if (eType === '공격') pDmgTaken = eRoll;

                        const deduction = Math.min(eRoll, baseData.player.int);
                        if (deduction > 0) {
                            state.enemy.pendingDebuffs[eItem.card.name] = (state.enemy.pendingDebuffs[eItem.card.name] || 0) + deduction;
                            spawnDamagePopup(pEl, `통찰! (-${deduction})`, '#a855f7', -30);
                        } else {
                            spawnDamagePopup(pEl, `통찰!`, '#a855f7', -30);
                        }
                    }
                } else if (pType === '회피') {
                    if (eType === '공격') pDmgTaken = eRoll > pRoll ? eRoll : 0;
                } else if (pType === '방어') {
                    if (eType === '공격') pDmgTaken = Math.max(0, eRoll - pRoll);
                }
            }
        }

        // --- 체력 차감 적용 및 데미지 팝업 출력 ---

        // 플레이어 피해 출력
        if (pDmgTaken > 0) {
            state.player.hp = Math.max(0, state.player.hp - pDmgTaken);
            spawnDamagePopup(pEl, `-${pDmgTaken}`, '#ef4444');
        } else if (eType === '공격' && pDmgTaken === 0) {
            // 적의 공격을 완전히 막거나 피했을 때 출력
            spawnDamagePopup(pEl, `방어!`, '#10b981');
        }

        // 적 피해 출력
        if (eDmgTaken > 0) {
            state.enemy.hp = Math.max(0, state.enemy.hp - eDmgTaken);
            spawnDamagePopup(eEl, `-${eDmgTaken}`, '#ef4444');
        } else if (pType === '공격' && eDmgTaken === 0) {
            spawnDamagePopup(eEl, `방어!`, '#10b981');
        }

        // 변경된 HP를 UI에 반영하고 애니메이션 콜백을 종료합니다.
        updateUI();
        if (callback) callback();
    }
}

// 모든 레일의 처리가 끝나고 새 턴을 준비합니다.
function endTurn() {
    state.turn++;
    state.phase = 'planning';
    document.getElementById('start-btn').disabled = false;

    // --- 디버프 이관 ---
    // 이번 턴에 쌓인 통찰 디버프(pending)를 다음 턴을 위한 활성 디버프(active)로 옮깁니다.
    // 기존에 있던 active 디버프들은 덮어씌워지므로 '단 한 턴'만 유지되는 로직이 자동 성립합니다.
    state.player.activeDebuffs = Object.assign({}, state.player.pendingDebuffs);
    state.player.pendingDebuffs = {};
    state.enemy.activeDebuffs = Object.assign({}, state.enemy.pendingDebuffs);
    state.enemy.pendingDebuffs = {};

    // --- 묘지 및 스테미나(덱) 회복 로직 ---

    // 플레이어: 비활성화되지 않은 정상 레일 중, 카드가 올라가지 않은 빈 슬롯 수를 셉니다.
    let pEmptyActive = 0;
    state.player.rail.forEach(slot => {
        if (!slot.disabled && slot.type !== 'card') pEmptyActive++;
        // 레일 위에서 사용된 카드들은 전부 묘지로 버립니다.
        if (slot.type === 'card' && slot.card) state.player.graveyard.push(slot.card);
    });
    // 빈 슬롯 수만큼 묘지의 무작위 카드를 덱으로 회수합니다.
    for (let i = 0; i < pEmptyActive; i++) {
        if (state.player.graveyard.length > 0) {
            let rIdx = Math.floor(Math.random() * state.player.graveyard.length);
            state.player.deck.push(state.player.graveyard.splice(rIdx, 1)[0]);
        }
    }

    // 적: 위와 동일한 회수 로직
    let eEmptyActive = 0;
    state.enemy.rail.forEach(slot => {
        if (!slot.disabled && slot.type !== 'card') eEmptyActive++;
        if (slot.type === 'card' && slot.card) state.enemy.graveyard.push(slot.card);
    });
    for (let i = 0; i < eEmptyActive; i++) {
        if (state.enemy.graveyard.length > 0) {
            let rIdx = Math.floor(Math.random() * state.enemy.graveyard.length);
            state.enemy.deck.push(state.enemy.graveyard.splice(rIdx, 1)[0]);
        }
    }

    // 레일 위 카드를 지우고 다시 초기화 (속도 비교에 의한 비활성 슬롯 재지정)
    initRails();

    // 템포: 턴마다 드로우하는 카드 양 (기본값: 전체 레일 수만큼, 최소 1)
    // 스테미너(deck)가 0인 경우 drawCards 내부의 (deck.length > 0) 조건에 의해 한 장도 드로우하지 않게 됩니다.
    drawCards('player', Math.max(1, state.railCount));
    drawCards('enemy', Math.max(1, state.railCount));

    // 적의 랜덤 행동을 새로 부여합니다.
    setupEnemyRandomTurn();

    // 턴이 끝날 때마다 플레이어 리롤 횟수 복구
    state.player.rerollsLeft = Math.floor(baseData.player.int / 2);

    // 화면 재배치
    renderRails();
    renderHand();
    updateUI();
}

// --- 게임 실행 진입점 ---
initGame();

// --- 드래그 앤 드롭 리롤 이벤트 세팅 ---
const playerDeckArea = document.getElementById('player-deck-area');
if (playerDeckArea) {
    playerDeckArea.addEventListener('dragover', e => {
        // 드래그 중인 카드가 있고, 리롤 횟수가 남아있고, 계획 단계일 때만 허용
        if (state.phase !== 'planning' || state.player.rerollsLeft <= 0) return;
        e.preventDefault();
        playerDeckArea.classList.add('drag-over');
    });

    playerDeckArea.addEventListener('dragleave', e => {
        playerDeckArea.classList.remove('drag-over');
    });

    playerDeckArea.addEventListener('drop', e => {
        playerDeckArea.classList.remove('drag-over');
        if (state.phase !== 'planning' || state.player.rerollsLeft <= 0) return;

        const uid = e.dataTransfer.getData('text/plain');
        rerollCard(uid);
    });
}

function rerollCard(uid) {
    const cardIdx = state.player.hand.findIndex(c => c.uid === uid);
    if (cardIdx === -1) return; // 핸드에 해당 카드가 없으면 무시

    // 리롤 횟수 차감
    state.player.rerollsLeft--;

    // 카드 핸드에서 제거 및 덱으로 반환
    const card = state.player.hand.splice(cardIdx, 1)[0];
    state.player.deck.push(card);

    // 덱을 다시 섞음
    state.player.deck.sort(() => Math.random() - 0.5);

    // 새 카드 1장 드로우
    drawCards('player', 1);

    // UI 업데이트
    renderHand();
    updateUI();
}
