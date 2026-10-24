"""Tactician: legal-move search, immediate goal defense and a two-ply lookahead.

Uses only Python's standard features. Works for either side and never mutates
the supplied state. Selective search keeps whole-match browser practice fast.
"""

_KIND = {"ROCK": 1, "PAPER": 2, "SCISSORS": 3}
_BEATS = (0, 3, 1, 2)
_NEAR = tuple(tuple(yy * 9 + xx
    for yy in range(max(0, i // 9 - 1), min(9, i // 9 + 2))
    for xx in range(max(0, i % 9 - 1), min(9, i % 9 + 2))
    if yy * 9 + xx != i) for i in range(81))


def _pos(c):
    return (int(c[1:]) - 1) * 9 + ord(c[0]) - 65


def _moves(board, side):
    return [(a, b) for a, p in enumerate(board) if p * side > 0
            for b in _NEAR[a] if not board[b]
            or (board[b] * side < 0 and _BEATS[abs(p)] == abs(board[b]))]


def choose_move(state):
    options = state["legal_moves"]
    if not options:
        return None
    player = state["player"]
    board = [(_KIND[p["type"]] * (1 if p["player"] == player else -1) if p else 0)
             for row in state["board"] for p in row]
    goal = 8 if player == "P1" else 72
    goals = {1: goal, -1: 80 - goal}
    lookup = {(_pos(m["from"]), _pos(m["to"])): m for m in options}

    def distance(at, side):
        g = goals[side]
        return max(abs(at % 9 - g % 9), abs(at // 9 - g // 9))

    def can_win(side):
        g = goals[side]
        return any(board[a] * side > 0 and (not board[g] or
                   (board[g] * side < 0 and _BEATS[abs(board[a])] == abs(board[g])))
                   for a in _NEAR[g])

    def evaluate():
        value, arrival = 0, {1: 12, -1: 12}
        for at, p in enumerate(board):
            if p:
                side = 1 if p > 0 else -1
                d = distance(at, side)
                arrival[side] = min(arrival[side], d)
                value += side * (45 - d * 2)
        return value + 65 * (arrival[-1] - arrival[1])

    def order(move, side):
        a, b = move
        return (10000 if b == goals[side] else 0) + (80 if board[b] else 0) + 20 * (distance(a, side) - distance(b, side)) - distance(b, side)

    ranked = []
    for move in lookup:
        a, b = move
        if b == goal:
            return {"from": lookup[move]["from"], "to": lookup[move]["to"]}
        p, captured = board[a], board[b]
        board[a], board[b] = 0, p
        safe = not can_win(-1)
        value = evaluate()
        board[a], board[b] = p, captured
        ranked.append((safe, value + order(move, 1) * .15, move))
    ranked.sort(reverse=True)
    safe = [row for row in ranked if row[0]] or ranked
    best, best_value = safe[0][2], -1000000
    for _, _, move in safe[:12]:
        a, b = move
        p, captured = board[a], board[b]
        board[a], board[b] = 0, p
        if can_win(-1):
            value = -100000
        else:
            replies = sorted(_moves(board, -1), key=lambda m: order(m, -1), reverse=True)
            value = 100000 if not replies else 1000000
            for c, d in replies[:12]:
                enemy, taken = board[c], board[d]
                board[c], board[d] = 0, enemy
                reply_value = 90000 if can_win(1) else evaluate()
                value = min(value, reply_value)
                board[c], board[d] = enemy, taken
        board[a], board[b] = p, captured
        # Break equal evaluations toward progress rather than shuffling guards.
        value += order(move, 1) * .05
        if value > best_value:
            best, best_value = move, value
    chosen = lookup[best]
    return {"from": chosen["from"], "to": chosen["to"]}
