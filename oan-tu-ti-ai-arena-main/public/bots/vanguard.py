"""Vanguard: bounded tactical search for the UET 9x9 arena.

Uses only the public state, plays either side, and returns a legal move.
Searches three plies early and two later; width is capped for the WASI budget.
"""
_KINDS = {"ROCK": 1, "PAPER": 2, "SCISSORS": 3}
_BEATS = (0, 3, 1, 2)
_PREDATOR = (0, 2, 3, 1)
_NEAR = tuple(tuple(y * 9 + x
    for y in range(max(0, i // 9 - 1), min(9, i // 9 + 2))
    for x in range(max(0, i % 9 - 1), min(9, i % 9 + 2))
    if y * 9 + x != i) for i in range(81))
_DIST = {g: tuple(max(abs(i % 9 - g % 9), abs(i // 9 - g // 9))
                  for i in range(81)) for g in (8, 72)}

def _pos(coord):
    return (int(coord[1:]) - 1) * 9 + ord(coord[0]) - 65

def choose_move(state):
    options = state["legal_moves"]
    if not options:
        return None
    player = state["player"]
    board = [(_KINDS[p["type"]] * (1 if p["player"] == player else -1)
              if p else 0) for row in state["board"] for p in row]
    goal = 8 if player == "P1" else 72
    goals = {1: goal, -1: 80 - goal}
    distances = {side: _DIST[g] for side, g in goals.items()}
    lookup = {(_pos(m["from"]), _pos(m["to"])): m for m in options}
    for move, original in lookup.items():
        if move[1] == goal:
            return {"from": original["from"], "to": original["to"]}
    home = goals[-1]
    # The initial fastest runners are PAPER. A SCISSORS keeper stops the
    # otherwise undefended seven-step corridor; this uses only the visible board.
    if state.get("turn", 0) < 2 and not board[home]:
        guards = [m for m in lookup if m[1] == home and board[m[0]] == 3]
        if guards:
            chosen = lookup[guards[0]]
            return {"from": chosen["from"], "to": chosen["to"]}
    recent = {}
    for step in state.get("history", [])[-12:]:
        if step.get("player") == player:
            at = _pos(step["to"])
            recent[at] = recent.get(at, 0) + 1

    def moves(side):
        return [(a, b) for a, piece in enumerate(board) if piece * side > 0
                for b in _NEAR[a] if not board[b] or
                (board[b] * side < 0 and _BEATS[abs(piece)] == abs(board[b]))]

    def winning(side):
        g, target = goals[side], board[goals[side]]
        return any(board[a] * side > 0 and
                   (not target or target * side < 0 and
                    _BEATS[abs(board[a])] == abs(target)) for a in _NEAR[g])

    def order(move, side):
        a, b = move
        target = board[goals[side]]
        blocked = target * side < 0 and _BEATS[abs(board[a])] != abs(target)
        return ((100000 if b == goals[side] else 0) +
                (110 if board[b] else 0) +
                (1800 if board[b] and distances[-side][b] <= 1 else 0) +
                32 * (distances[side][a] - distances[side][b]) -
                3 * distances[side][b] - 45 * blocked - (recent.get(b, 0) * 5 if side == 1 else 0))

    def evaluate():
        value, racers = 0, {1: [], -1: []}
        for at, piece in enumerate(board):
            if piece:
                side = 1 if piece > 0 else -1
                d = distances[side][at]
                target = board[goals[side]]
                if target * side < 0 and _BEATS[abs(piece)] != abs(target):
                    d += 3
                value += side * (48 - d * 3)
                racers[side].append((d, at, piece))
        for side in (1, -1):
            runners = sorted(racers[side])[:3]
            for weight, (d, at, piece) in zip((115, 30, 12), runners):
                danger = any(board[n] * side < 0 and
                             abs(board[n]) == _PREDATOR[abs(piece)] for n in _NEAR[at])
                value += side * weight * (9 - d - (0.85 if danger else 0))
        return value

    def search(side, depth, alpha, beta):
        if winning(side):
            return 100000 + depth * 100
        if depth == 0:
            return side * evaluate()
        choices = moves(side)
        if not choices:
            return -100000 - depth * 100
        best = -1000000
        for a, b in sorted(choices, key=lambda m: order(m, side), reverse=True)[:6 if depth >= 2 else 4]:
            piece, taken = board[a], board[b]
            board[a], board[b] = 0, piece
            score = -search(-side, depth - 1, -beta, -alpha)
            board[a], board[b] = piece, taken
            if score > best:
                best = score
            alpha = max(alpha, best)
            if alpha >= beta:
                break
        return best

    candidates = []
    mobile_attackers = any(a != home for a, b in lookup)
    for move in lookup:
        a, b = move
        if b == goal:
            return {"from": lookup[move]["from"], "to": lookup[move]["to"]}
        if a == home and mobile_attackers:
            continue
        piece, taken = board[a], board[b]
        board[a], board[b] = 0, piece
        safe = not winning(-1)
        board[a], board[b] = piece, taken
        candidates.append((safe, order(move, 1), move))
    candidates.sort(reverse=True)
    candidates = [row for row in candidates if row[0]] or candidates
    best, value = candidates[0][2], -1000000
    for _, priority, (a, b) in candidates[:8]:
        piece, taken = board[a], board[b]
        board[a], board[b] = 0, piece
        score = -search(-1, 2 if state.get('turn', 0) < 20 else 1, -1000000, -value) + priority * 0.01
        board[a], board[b] = piece, taken
        if score > value:
            value, best = score, (a, b)
    chosen = lookup[best]
    return {"from": chosen["from"], "to": chosen["to"]}
