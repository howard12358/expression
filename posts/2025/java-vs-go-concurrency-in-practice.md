---
title: 'Java vs Go 并发实战 (数据流式处理)'
date: 2025-11-21
category: 技术
tags:
  - go
  - java
  - 并发编程
description: 
---

# Java vs Go 并发实战 (数据流式处理)

::: details 代码细节

`EsCollector`类：

```java
@Slf4j
public class EsCollector {
    /**
     * 上下文信息，传递数据
     */
    private final SqlCollectContext ctx;

    public EsCollector(SqlCollectContext ctx) {
        this.ctx = ctx;
    }

    public void run() {
        ThreadPoolTaskExecutor esCollectorExecutor = SpringBeanUtils.getApplicationContext()
                .getBean("esCollectorExecutor", ThreadPoolTaskExecutor.class);
        ThreadPoolTaskExecutor esFetchExecutor = SpringBeanUtils.getApplicationContext()
                .getBean("esFetchExecutor", ThreadPoolTaskExecutor.class);
        SqlAnalyzeTask task = ctx.getSqlAnalyzeTask();
        LocalDateTime statDateTime = ctx.getStatDateTime();
        long jobStart = ctx.getJobStartTime();
        try {
            esCollectorExecutor.execute(() -> {
                try {
                    CompletableFuture<Void> prev = CompletableFuture.completedFuture(null);

                    Instant endTime = statDateTime.atZone(TimeUtils.SHANGHAI_ZONE).toInstant();
                    Instant startTime = endTime.minus(task.getTaskInterval(), MINUTES);

                    List<DatabusServiceConfigDTO> dscList = sqlAnalyzeTaskService.getDataBusServiceConfig(task);
                    List<String> flagList = ctx.getFlagList();

                    AtomicBoolean fetchFetched = new AtomicBoolean(false);
                    SqlAnalysisCoordinator parser = new SqlAnalysisCoordinator(fetchFetched, ctx);
                    BlockingQueue<EsSqlInfo> queue = parser.getSqlParseQueue();
                    // 遍历每个 1 分钟小窗口
                    for (int i = 0; i < task.getTaskInterval(); i++) {
                        final int segmentIdx = i;

                        Instant segmentStart = startTime.plus(i, ChronoUnit.MINUTES);
                        Instant segmentEnd = segmentStart.plus(1, ChronoUnit.MINUTES);

                        // 保证每分钟窗口内的 es 拉取任务是串行的
                        prev = prev.thenCompose(ignored -> CompletableFuture
                                .allOf(dscList.stream()
                                        .map(dsc -> CompletableFuture.supplyAsync(() -> {
                                                    // （1）这里发起真正的单节点 ES 拉取
                                                    try {
                                                        // 构建 es 请求过程忽略
                                                        long start = System.currentTimeMillis();
                                                        // 参数构建步骤省略
                                                        long hits = fetchSQLFromEs(
                                                                getSearchRequest(q),
                                                                client,
                                                                queue,
                                                                segmentIdx
                                                        );
                                                        return hits;
                                                    } catch (IOException e) {
                                                        return 0L;
                                                    }
                                                }, esFetchExecutor)
                                        ).toArray(CompletableFuture[]::new)
                                )
                                // (2) 等本分钟所有节点都拉完，再 put marker
                                .thenRun(() -> {
                                    try {
                                        queue.put(EsSqlInfo.segmentMarker(segmentIdx));
                                    } catch (InterruptedException ie) {
                                        Thread.currentThread().interrupt();
                                    }
                                })
                        );
                    }

                    // 串联结束后，再发五分钟结束标记
                    prev.thenRun(() -> {
                                fetchFetched.set(true);
                            })
                            .exceptionally(t -> {
                                log.error("An error occurred during the pulling process", t);
                                fetchFetched.set(true);
                                return null;
                            });
                } catch (Exception e) {}
            });
        } catch (Exception e) {}
    }

    /**
     * 从 ES 中拉取数据，解析后放入队列
     */
    private long fetchSQLFromEs(SearchRequest searchRequest, RestHighLevelClient esClient,
                                BlockingQueue<EsSqlInfo> sqlParseQueue, int segmentIdx) throws IOException {
        final Scroll scroll = new Scroll(TimeValue.timeValueMinutes(1L));
        searchRequest.scroll(scroll);
        SearchResponse searchResponse = esClient.search(searchRequest);

        SqlAnalyzeTask task = ctx.getSqlAnalyzeTask();
        long hitCount = 0;
        try {
            do {
                if (searchResponse.getHits().getHits().length > 0) {
                    hitCount += searchResponse.getHits().getHits().length;
                    searchResponse.getHits().forEach(hit -> {
                        try {
                            Map<String, Object> sourceMap = hit.getSourceAsMap();
                            // 省略es数据取字段的过程
                            if (StringUtils.isNotEmpty(sql)) {
                                // 将数据放入阻塞队列
                                sqlParseQueue.put(new EsSqlInfo(...));
                            }
                        } catch (Exception e) {
                            log.error("SQL enqueue error: {}", e.getMessage(), e);
                        }
                    });
                }
                String scrollId = searchResponse.getScrollId();
                SearchScrollRequest scrollRequest = new SearchScrollRequest(scrollId);
                scrollRequest.scroll(scroll);

                searchResponse = esClient.scroll(scrollRequest, options);
            } while (searchResponse.getHits().getHits().length != 0);
        } catch (IOException e) {} finally {
            ClearScrollRequest clearScrollRequest = new ClearScrollRequest();
            clearScrollRequest.addScrollId(searchResponse.getScrollId());
            esClient.clearScroll(clearScrollRequest, options);
        }
        return hitCount;
    }
}
```

`SqlAnalysisCoordinator`类：

```java
/**
 * SQL 解析协调器
 */
@Slf4j
public class SqlAnalysisCoordinator {
    // 声明为无界队列
    @Getter
    private final BlockingQueue<EsSqlInfo> sqlParseQueue = new LinkedBlockingQueue<>();
    private final AtomicBoolean fetchFinished;
    private final SqlCollectContext ctx;

    // ApplicationContext 上下文，用于发布事件
    private final ApplicationContext applicationCtx = SpringBeanUtils.getApplicationContext();

    // 用于并发解析的线程池
    private final ThreadPoolTaskExecutor parseExecutor = SpringBeanUtils.getApplicationContext()
            .getBean("sqlParseExecutor", ThreadPoolTaskExecutor.class);

    // 全局计数
    private final AtomicLong published = new AtomicLong(0);
    // 全局 pending 解析计数
    private final AtomicInteger globalPending = new AtomicInteger(0);
    // 保证全局结束事件只发布一次
    private final AtomicBoolean allFinishEmitted = new AtomicBoolean(false);

    /**
     * 每个分段的状态
     */
    // 每个分段正在解析的线程计数
    private final ConcurrentHashMap<Integer, AtomicInteger> segPendingCountMap = new ConcurrentHashMap<>();
    // 每个分段解析完成的计数
    private final ConcurrentHashMap<Integer, AtomicLong> segParsedCountMap = new ConcurrentHashMap<>();
    // 每个分段的结束标识
    private final Set<Integer> markerSeenSet = ConcurrentHashMap.newKeySet();

    // 初始化时启动消费者线程
    public SqlAnalysisCoordinator(AtomicBoolean fetchFinished, SqlCollectContext ctx) {
        this.fetchFinished = fetchFinished;
        this.ctx = ctx;
        ThreadPoolTaskExecutor pollExecutor = SpringBeanUtils.getApplicationContext()
                .getBean("sqlPollExecutor", ThreadPoolTaskExecutor.class);

        // 启动一个轮询任务
        pollExecutor.submit(this::pollAndDispatch);
    }

    /**
     * 不断从队列中获取数据并处理
     */
    private void pollAndDispatch() {
        try {
            while (true) {
                // 队列为空会阻塞 1s，有数据则被唤醒
                EsSqlInfo esSqlInfo = sqlParseQueue.poll(1000, TimeUnit.MILLISECONDS);

                // 只有在拉取结束且队列空时，才退出
                if (esSqlInfo == null) {
                    // 检查是否为采集任务 (五分钟) 的结束标识
                    if (fetchFinished.get() && sqlParseQueue.isEmpty()) {
                        break;
                    }
                    continue;
                }
                // 检查是否为一分钟的结束标识
                int idx = esSqlInfo.getSegmentIndex();
                if (esSqlInfo.isSegmentMarker()) {
                    markerSeenSet.add(idx);
                    AtomicInteger pend = segPendingCountMap.get(idx);
                    if (pend == null || pend.get() == 0) {
                        publishSegFinish(idx);
                    }
                }
                // 并发解析
                else {
                    // 统计 segment pending
                    segPendingCountMap.computeIfAbsent(idx, k -> new AtomicInteger(0))
                            .incrementAndGet();
                    // 全局 pending++
                    globalPending.incrementAndGet();
                    parseExecutor.submit(() -> parseAndPublish(esSqlInfo));
                }
            }

            tryPublishAllFinish(globalPending.get());
        } catch (Exception e) {}
    }

    /**
     * 解析SQL并发布事件
     */
    private void parseAndPublish(EsSqlInfo esSqlInfo) {
        int idx = esSqlInfo.getSegmentIndex();
        try {
            // 省略数据解析步骤
            applicationCtx.publishEvent(new SqlParsedEvent(...);
            applicationCtx.publishEvent(new SqlParsedSegmentEvent(...);

            // 线程安全地累加计数
            published.incrementAndGet();
            // 统计 segment 总量
            segParsedCountMap.computeIfAbsent(idx, k -> new AtomicLong(0))
                    .incrementAndGet();
        } catch (Exception e) {} finally {
            AtomicInteger pend = segPendingCountMap.get(idx);
            int segPend = pend == null ? 0 : pend.decrementAndGet();

            // 尝试发布分段结束事件
            if (segPend == 0 && markerSeenSet.contains(idx)) {
                publishSegFinish(idx);
            }

            // 尝试发布全局结束事件
            int allPend = globalPending.decrementAndGet();
            tryPublishAllFinish(allPend);
        }
    }

    private void tryPublishAllFinish(int pending) {
        if (pending == 0
                && fetchFinished.get()
                && sqlParseQueue.isEmpty()
                && allFinishEmitted.compareAndSet(false, true)) {
            long total = published.get();
            if (total > 0) {
                applicationCtx.publishEvent(new SqlParseFinishEvent(...));
            }
        }
    }

    private void publishSegFinish(int segmentIdx) {
        // 幂等保护，如果 markerSeenSet.remove 返回 false，说明这个 segment 的结束事件
        // 已经发布过一次了，直接 return，不会重复发
        if (!markerSeenSet.remove(segmentIdx)) return;
        AtomicLong segCount = segParsedCountMap.remove(segmentIdx);

        if (segCount != null && segCount.get() > 0) {
            long count = segCount.get();
            segPendingCountMap.remove(segmentIdx);
            applicationCtx.publishEvent(new SqlParseFinishSegmentEvent(...));
        }
    }
}
```

:::

## 一个典型的日志分析场景

前段时间在开发一个日志分析系统，核心逻辑是从 Elasticsearch 拉取全量日志，进行语法解析，然后聚合统计，最后入库。这是一个标准的 **Producer-Consumer** 模型，但因为数据量大且对实时性有要求，为了压榨性能，最后演变成一个比较复杂的并发控制（可以查看上述代码细节）。

简单来说，需要解决了一个核心问题：**如何在一个“生产者-分发者-消费者”模型中，既能并发处理任务，又能精确地知道“所有任务”和“某一批任务”何时处理完毕**，这里之所以引入分发者就是为了阐述不是简单的生产消费模型，生产者是分段、并发的进行生产（段与段之间有序，段内并发），消费者则要保证段与段之间的数据完整和并发消费，无论生产还是消费，都离不开“有序的分段提交”与“无序的并发执行”，因此引入分发者。

## Java 是如何“艰难”实现的

Java 为了实现高性能并发，代码中充满了各种“多线程原语”的博弈，从而大大增加了复杂度，管理不慎极其容易出错。

### 复杂的异步编排 (CompletableFuture)

在 `EsCollector` 类中，为了并行拉取不同时间分片（Segment）的数据，这里使用了 `CompletableFuture` 的链式调用：

```java
CompletableFuture.allOf(dscList.stream()
    .map(dsc -> CompletableFuture.supplyAsync(() -> {
        // ... 拉取逻辑
    }, esFetchExecutor))
    .toArray(CompletableFuture[]::new))
.thenRun(() -> {
    // ... 这一分钟拉取结束，放入标记位
    queue.put(EsSqlInfo.segmentMarker(segmentIdx));
});
```

**痛点**：

- **回调地狱的变体**：虽然 `CompletableFuture` 比 Callback 好，但这种 `allOf` + `thenRun` 依然破坏了代码的线性逻辑。
- **异常处理困难**：在 Future 链条中捕获异常并正确中断整个流程是非常麻烦的（代码中使用了 `exceptionally` 但阅读起来很跳跃）。

### 手写状态机来判断“任务是否完成”

这是最让人头秃的地方。在 `SqlAnalysisCoordinator` 中，因为是异步生产、异步消费，主线程无法简单地知道“什么时候所有数据都处理完了”。

为了做到这一点，代码不得不维护了一堆原子计数器：

```java
// 全局计数
private final AtomicLong published = new AtomicLong(0);
// 全局 pending 解析计数
private final AtomicInteger globalPending = new AtomicInteger(0);
// 每个分段正在解析的线程计数
private final ConcurrentHashMap<Integer, AtomicInteger> segPendingCountMap = new ConcurrentHashMap<>();
// 每个分段解析完成的计数
private final ConcurrentHashMap<Integer, AtomicLong> segParsedCountMap = new ConcurrentHashMap<>();
// 每个分段的结束标识
private final Set<Integer> markerSeenSet = ConcurrentHashMap.newKeySet();
```

每处理一条数据 `increment`，处理完 `decrement`。还要监听队列里的 `Marker` 对象（哨兵模式）。这种**手动引用计数**极其容易出错：

- **漏加或漏减**：导致任务永远挂起或提前结束。
- **竞态条件**：判断 `pending == 0` 和 `publish` 事件之间必须非常小心。

## 如果用 Go 会变成什么样？

如果使用 Go 语言，我们可以利用 `Goroutine`（轻量级线程）和 `Channel`（管道）将上述逻辑简化为一条直观的流水线。

**核心优势**：Go 的 Channel 自带“关闭”广播机制和阻塞特性，我们**不再需要手写原子计数器来判断结束**。

Go 方案架构设计：Pipeline 模式：`Fetcher (ES)` -> `Channel` -> `Parser (Workers)` -> `Channel` -> `Aggregator`。

### 生产者

**“分段（Segment/分钟）之间串行，分段内部（针对不同 配置）并发”**，Go 的实现方式会利用 **`for` 循环的天然顺序性** 加上 **`errgroup` 的等待机制**：

```go
func fetchFromES(ctx context.Context, task Task, dscList []DscConfig, outCh chan<- any) error {
    defer close(outCh) // 全局结束信号
    
    // 1. 外层循环：控制“段与段之间有序”
    for i := 0; i < task.Interval; i++ {
        // 设定当前分片的时间范围
        segmentTime := task.Start.Add(time.Duration(i) * time.Minute)
        // 创建一个新的 errgroup，仅用于管理“当前这 1 分钟”内的并发任务
        var g errgroup.Group 
        
        // 2. 内层循环：控制“段内并发”
        for _, dsc := range dscList {
            dsc := dsc // 闭包陷阱：捕获循环变量
            g.Go(func() error {
                // 这里是并发执行的逻辑
                hits, err := doRealEsScrollFetch(ctx, dsc, segmentTime)
                if err != nil {
                    return err
                }
                // 发送数据到通道
                for _, hit := range hits {
                    outCh <- hit
                }
                return nil
            })
        }
        
        // 3. 关键点：Barrier（栅栏）
        // g.Wait() 会阻塞当前 Goroutine，直到“当前这 1 分钟”内启动的所有协程都执行完毕
        if err := g.Wait(); err != nil {
            return err
        }
        
        // 4. 发送当前分片的结束标记 (Segment Marker)
        // 下游收到这个标记，就知道第 i 分钟的数据已经发完了，可以触发一次小聚合
        outCh <- Marker{SegmentIndex: i}
    }
    
    return nil
}
```

**Java 的做法 (基于回调的异步编排)**

Java 代码中为了实现这个逻辑，把“循环”拆解成 `CompletableFuture` 的链条（jdk21 引入虚拟线程后可能会有和 go 相似的处理）。

- **逻辑**：`CurrentFuture.thenCompose(NextFuture)`。
- **痛点**：你不能写 `for` 循环，因为 `for` 循环是同步阻塞的，会卡住主线程（或者你需要在一个巨大的线程池里阻塞等待）。你必须构建一个巨大的 `CompletableFuture` 链表。

**Go 的做法 (基于同步思维的并发)**

Go 的代码结构回归了最朴素的 **嵌套循环**。

1. **外层 `for`**：自然就是串行的。Go 运行时允许你在 Goroutine 里安全地阻塞，所以 `g.Wait()` 尽管卡住了 `fetchFromES` 这个函数，但它不会阻塞操作系统的线程（OS Thread），只会挂起这个轻量级的 Goroutine。
2. **内层 `g.Go`**：在循环内部瞬间发射出 N 个并发任务。
3. **`g.Wait()`**：充当了**同步栅栏**。它确保了“段内”所有并发完全收敛，才放行“段间”的进度。

### 分发者

在 Go 中，我们可以利用 `sync.WaitGroup` 和 `Channel` 的特性来简化“全局结束”的判断，但对于“分段结束”的逻辑，依然保留类似引用计数的设计（因为分段是乱序完成的）。

```go
// --- 模拟数据结构 ---

type EsSqlInfo struct {
	IsMarker     bool
	SegmentIndex int
	Data         string // 实际数据
	// ... 其他字段
}

// 模拟事件发布
type EventBus interface {
	PublishSegmentFinish(segmentIndex int, count int64)
	PublishGlobalFinish(totalCount int64)
}

// --- 协调器实现 ---

type SegmentState struct {
	Pending   int64 // 正在处理的数量
	Processed int64 // 已处理完成的数量
	Marker    bool  // 是否收到了结束标记
}

type SqlAnalysisCoordinator struct {
	inCh     <-chan EsSqlInfo // 输入通道 (替代 BlockingQueue)
	eventBus EventBus

	// 状态管理
	mu       sync.Mutex            // 保护 segMap
	segMap   map[int]*SegmentState // 替代 segPendingCountMap 和 segParsedCountMap

	// 全局计数
	totalPublished int64
	
	// 并发控制
	workerSem chan struct{}  // 替代 ThreadPoolTaskExecutor，限制并发数
	globalWg  sync.WaitGroup // 用于判断全局任务是否全部完成
}

func NewSqlAnalysisCoordinator(inCh <-chan EsSqlInfo, bus EventBus, maxConcurrency int) *SqlAnalysisCoordinator {
	return &SqlAnalysisCoordinator{
		inCh:      inCh,
		eventBus:  bus,
		segMap:    make(map[int]*SegmentState),
		workerSem: make(chan struct{}, maxConcurrency), // 信号量控制并发
	}
}

// Run 启动协调器 (替代 Java 的 pollAndDispatch + 构造函数启动)
func (c *SqlAnalysisCoordinator) Run(ctx context.Context) {
	// 启动一个后台协程监控“全局结束”
	// 只有当 inCh 关闭(fetchFinished) 且 所有 worker 归零(globalWg) 时触发
	go func() {
		c.globalWg.Wait()
		// 这里 Wait() 返回意味着：生产者已关闭通道 且 所有已分发的任务都执行完毕
		if c.totalPublished > 0 {
			c.eventBus.PublishGlobalFinish(atomic.LoadInt64(&c.totalPublished))
		}
	}()

	// 主循环：不断从通道获取数据
	// range 会一直阻塞，直到 inCh 被上游 close()，相当于 Java 的 fetchFinished = true 且队列为空
	for info := range c.inCh {
		segmentIdx := info.SegmentIndex
		// 获取或初始化分段状态
		state := c.getSafeSegmentState(segmentIdx)

		if info.IsMarker {
			// --- 处理 Marker ---
			c.mu.Lock()
			state.Marker = true
			// 检查是否可以直接触发分段结束 (即：标记到了，且没有 pending 任务)
			pending := atomic.LoadInt64(&state.Pending)
			if pending == 0 {
				c.triggerSegmentFinishLocked(segmentIdx, state)
			}
			c.mu.Unlock()
		} else {
			// --- 处理数据 ---
			
			// 1. 增加计数
			atomic.AddInt64(&state.Pending, 1)
			c.globalWg.Add(1) // 全局 WaitGroup +1

			// 2. 申请并发额度 (P操作)
			c.workerSem <- struct{}{}

			// 3. 异步执行解析 (替代 parseExecutor.submit)
			go func(info EsSqlInfo, s *SegmentState) {
				defer func() {
					// 释放并发额度 (V操作)
					<-c.workerSem
					// 减少全局等待
					c.globalWg.Done()
					// 处理分段计数完成逻辑
					c.onWorkerFinish(info.SegmentIndex, s)
				}()

				// 执行具体的解析业务逻辑
				c.doParse(info)
			}(info, state)
		}
	}
}

// doParse 模拟解析逻辑
func (c *SqlAnalysisCoordinator) doParse(info EsSqlInfo) {
	// ... 解析 SQL ...
	
	// 累加全局成功数
	atomic.AddInt64(&c.totalPublished, 1)
}

// onWorkerFinish 当一个解析任务完成时调用
func (c *SqlAnalysisCoordinator) onWorkerFinish(segmentIdx int, state *SegmentState) {
	// 1. 累加该分段的完成数
	atomic.AddInt64(&state.Processed, 1)

	// 2. 减少该分段的 Pending 数
	newPending := atomic.AddInt64(&state.Pending, -1)

	// 3. 检查是否触发分段结束 (Double Check)
	// 只有当 pending 为 0 且 收到过 Marker 时才触发
	if newPending == 0 {
		c.mu.Lock()
		defer c.mu.Unlock()
		
		// 加锁后再次检查 (防止并发竞态)，且检查 Marker 是否已到
		if atomic.LoadInt64(&state.Pending) == 0 && state.Marker {
			c.triggerSegmentFinishLocked(segmentIdx, state)
		}
	}
}

// getSafeSegmentState 线程安全地获取状态对象
func (c *SqlAnalysisCoordinator) getSafeSegmentState(idx int) *SegmentState {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.segMap[idx]; !ok {
		c.segMap[idx] = &SegmentState{}
	}
	return c.segMap[idx]
}

// triggerSegmentFinishLocked 触发分段结束事件并清理 Map
//以此方法调用时必须持有锁
func (c *SqlAnalysisCoordinator) triggerSegmentFinishLocked(idx int, state *SegmentState) {
	// 确保只发送一次 (类似于 Java 的 remove 操作)
	if _, exists := c.segMap[idx]; exists {
		count := atomic.LoadInt64(&state.Processed)
		if count > 0 {
			c.eventBus.PublishSegmentFinish(idx, count)
		}
		// 从 Map 中移除，保证幂等性，防止后续重复触发
		delete(c.segMap, idx)
	}
}
```

**对比分析：为什么 Go 版本更好维护？**

**1. 全局完成的判断**

- **Java**: 需要维护 `fetchFinished` (AtomicBoolean) 和 `globalPending` (AtomicInteger)。最痛苦的是，你需要在 **主循环退出时** 和 **每一个 Worker 结束时** 都去尝试调用 `tryPublishAllFinish`。这非常容易遗漏或者产生并发 Bug。
- **Go**: 使用 `c.globalWg.Wait()`。
  - `inCh` 关闭，主循环退出，数据不再进入。
  - `Wait()` 会一直等到所有在执行的 goroutine 全部 `Done()`。
  - 逻辑是线性的：`Channel Close` -> `Wait Done` -> `Publish Finish`。不需要散落在各处的 `if` 判断。

**2. 消除忙轮询**

- **Java**: `sqlParseQueue.poll(1000, TimeUnit.MILLISECONDS)`。即使没有数据，线程也在空转或定时唤醒，需要处理 null 的情况，需要处理中断异常。
- **Go**: `for info := range c.inCh`。如果通道没数据，Goroutine 挂起（不消耗 CPU）。如果通道关闭，循环优雅退出。

**3. 资源管理**

- **Java**: 依赖 `ThreadPoolTaskExecutor`。
- **Go**: 使用 `workerSem` (信号量 channel) 控制并发度，然后为每个任务启动一个轻量级 Goroutine。这比线程池更灵活，代码量也更少。

**4. 锁的粒度**

- **Java**: 使用了 `ConcurrentHashMap` 和多个 `Atomic` 变量。虽然性能好，但逻辑分散。`publishSegFinish` 里还需要 `markerSeenSet.remove` 来做幂等。
- **Go**: 使用了一个 `sync.Mutex` 来保护 `segMap` 的操作。在触发分段结束时，直接 `delete(c.segMap, idx)`，天然保证了事件只会触发一次（因为第二次就查不到这个 key 了），替代了 Java 中 `markerSeenSet` 的作用。

## 总结

回顾这段 Java 代码，它写得其实很规范，遵循了 Java 生态的最佳实践。**它的复杂不是代码质量差，而是 Java 语言模型在处理“高并发流式计算”时的内禀复杂性。**

在使用 Go 重写这类逻辑时，我们感受到的最大便利并非性能的数倍提升（虽然通常确实更快），而是**心智负担的显著降低**。

- **Java**: 我是在**管理**线程，在**协调**状态。
  **Java Flow:** `[ES] --(Future)--> [Queue] <--(Poll & AtomicCheck)-- [Coordinator] --(Event)--> [Aggregator]` *(状态分散在 Queue, Coordinator 的 Atomic 变量, 和 Future 的回调中)*
- **Go**: 我在**描述**数据的流向。
  **Go Flow:** `[ES] --(Chan)--> [Worker] --(Chan)--> [Aggregator]` *(状态由 Channel 的 Open/Close 状态自然流转)*