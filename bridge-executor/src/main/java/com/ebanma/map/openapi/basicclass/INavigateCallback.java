package com.ebanma.map.openapi.basicclass;

import android.os.Binder;
import android.os.IBinder;
import android.os.IInterface;
import android.os.Parcel;
import android.os.RemoteException;

/** INavigateCallback: callback(1) / errorCallback(2) — 由地图端回调。 */
public interface INavigateCallback extends IInterface {
    void callback(boolean success) throws RemoteException;
    void errorCallback(int code, String message) throws RemoteException;

    abstract class Stub extends Binder implements INavigateCallback {
        public static final String DESCRIPTOR = "com.ebanma.map.openapi.basicclass.INavigateCallback";

        public Stub() { attachInterface(this, DESCRIPTOR); }

        public static INavigateCallback asInterface(IBinder obj) {
            if (obj == null) return null;
            IInterface iin = obj.queryLocalInterface(DESCRIPTOR);
            if (iin != null && iin instanceof INavigateCallback) return (INavigateCallback) iin;
            return new Proxy(obj);
        }

        @Override public IBinder asBinder() { return this; }

        @Override public boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
            switch (code) {
                case 1: data.enforceInterface(DESCRIPTOR);
                    boolean ok = data.readBoolean();
                    callback(ok);
                    reply.writeNoException();
                    return true;
                case 2: data.enforceInterface(DESCRIPTOR);
                    int c = data.readInt();
                    String m = data.readString();
                    errorCallback(c, m);
                    reply.writeNoException();
                    return true;
            }
            return super.onTransact(code, data, reply, flags);
        }

        private static class Proxy implements INavigateCallback {
            private final IBinder mRemote;
            Proxy(IBinder remote) { mRemote = remote; }
            @Override public IBinder asBinder() { return mRemote; }

            @Override public void callback(boolean success) throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    data.writeBoolean(success);
                    mRemote.transact(1, data, reply, 0);
                    reply.readException();
                } finally { reply.recycle(); data.recycle(); }
            }

            @Override public void errorCallback(int code, String message) throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    data.writeInt(code);
                    data.writeString(message);
                    mRemote.transact(2, data, reply, 0);
                    reply.readException();
                } finally { reply.recycle(); data.recycle(); }
            }
        }
    }
}
