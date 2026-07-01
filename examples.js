// A small library of ready-to-run snippets, one per data structure,
// so the tool works the moment someone opens the page.
const EXAMPLES = {

"Array — bubble sort": `arr = [5, 3, 8, 1, 2]
n = len(arr)
for i in range(n):
    for j in range(0, n - i - 1):
        if arr[j] > arr[j + 1]:
            arr[j], arr[j + 1] = arr[j + 1], arr[j]
print(arr)`,

"Stack — balanced brackets": `stack = []
text = "([{}])"
ok = True
for ch in text:
    if ch in "([{":
        stack.append(ch)
    else:
        if len(stack) == 0:
            ok = False
        else:
            stack.pop()
print(ok)`,

"Queue — level order feed": `from collections import deque
queue = deque()
queue.append(10)
queue.append(20)
queue.append(30)
first = queue.popleft()
queue.append(40)
print(first)
print(list(queue))`,

"Linked List — build & traverse": `class Node:
    def __init__(self, val):
        self.val = val
        self.next = None

head = Node(1)
head.next = Node(2)
head.next.next = Node(3)
head.next.next.next = Node(4)

total = 0
cur = head
while cur is not None:
    total = total + cur.val
    cur = cur.next
print(total)`,

"Binary Search Tree — insert": `class Node:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None

def insert(root, val):
    if root is None:
        return Node(val)
    if val < root.val:
        root.left = insert(root.left, val)
    else:
        root.right = insert(root.right, val)
    return root

root = None
for v in [8, 3, 10, 1, 6, 14, 4, 7]:
    root = insert(root, v)
print("done")`,

"AVL Tree — rotation": `class Node:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None
        self.height = 1

def h(n):
    return n.height if n else 0

def update(n):
    n.height = 1 + max(h(n.left), h(n.right))

def rotate_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    update(y)
    update(x)
    return x

def insert(root, val):
    if root is None:
        return Node(val)
    if val < root.val:
        root.left = insert(root.left, val)
    else:
        root.right = insert(root.right, val)
    update(root)
    balance = h(root.left) - h(root.right)
    if balance > 1 and val < root.left.val:
        return rotate_right(root)
    return root

root = None
for v in [30, 20, 10]:
    root = insert(root, v)
print("balanced")`,

"Heap — min-heap push/pop": `import heapq
heap = []
heapq.heappush(heap, 5)
heapq.heappush(heap, 2)
heapq.heappush(heap, 9)
heapq.heappush(heap, 1)
smallest = heapq.heappop(heap)
print(smallest)
print(heap)`,

"Hash Map — word count": `text = ["cat", "dog", "cat", "bird", "dog", "cat"]
counts = {}
for word in text:
    if word in counts:
        counts[word] = counts[word] + 1
    else:
        counts[word] = 1
print(counts)`,

"Set — unique visitors": `visits = ["u1", "u2", "u1", "u3", "u2", "u4"]
unique = set()
for v in visits:
    unique.add(v)
print(len(unique))`,

};
