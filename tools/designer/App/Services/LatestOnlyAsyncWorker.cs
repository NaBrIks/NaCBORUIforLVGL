namespace NaCBORUI.Designer.App.Services;

/// <summary>Runs one async job and keeps only one latest request waiting behind it.</summary>
public sealed class LatestOnlyAsyncWorker : IDisposable
{
    private readonly object _gate = new();
    private CancellationTokenSource _lifetime = new();
    private Func<int, long, CancellationToken, Task>? _latestWork;
    private bool _running;
    private bool _pending;
    private bool _disposed;
    private int _generation;
    private long _requestVersion;

    public int Generation { get { lock (_gate) return _generation; } }
    public long RequestVersion { get { lock (_gate) return _requestVersion; } }
    public bool IsRunning { get { lock (_gate) return _running; } }
    public bool IsPending { get { lock (_gate) return _pending; } }

    public void Request(Func<int, long, CancellationToken, Task> work)
    {
        ArgumentNullException.ThrowIfNull(work);
        var start = false;
        lock (_gate)
        {
            if (_disposed) return;
            _latestWork = work;
            _requestVersion++;
            _pending = true;
            if (!_running)
            {
                _running = true;
                start = true;
            }
        }
        if (start) _ = Task.Run(RunAsync);
    }

    public void Invalidate()
    {
        CancellationTokenSource old;
        lock (_gate)
        {
            if (_disposed) return;
            _generation++;
            _pending = false;
            _latestWork = null;
            old = _lifetime;
            _lifetime = new CancellationTokenSource();
        }
        old.Cancel();
        old.Dispose();
    }

    private async Task RunAsync()
    {
        while (true)
        {
            Func<int, long, CancellationToken, Task>? work;
            CancellationToken token;
            int generation;
            long requestVersion;
            lock (_gate)
            {
                if (_disposed || !_pending || _latestWork is null)
                {
                    _running = false;
                    return;
                }
                _pending = false;
                work = _latestWork;
                _latestWork = null;
                token = _lifetime.Token;
                generation = _generation;
                requestVersion = _requestVersion;
            }

            try { await work(generation, requestVersion, token).ConfigureAwait(false); }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { }
            catch { /* Each owner reports its own work errors. */ }

            lock (_gate)
            {
                if (_disposed || !_pending)
                {
                    _running = false;
                    return;
                }
            }
        }
    }

    public void Dispose()
    {
        CancellationTokenSource old;
        lock (_gate)
        {
            if (_disposed) return;
            _disposed = true;
            _pending = false;
            _latestWork = null;
            old = _lifetime;
        }
        old.Cancel();
        old.Dispose();
    }
}
