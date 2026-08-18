package com.ebanma.map.openapi.basicclass;

import android.os.Binder;
import android.os.IBinder;
import android.os.IInterface;
import android.os.Parcel;
import android.os.RemoteException;

/** IChangeDestinationCallback: onFailure(1) / onSuccess(2) — 由地图端回调。 */
public interface IChangeDestinationCallback extends IInterface {
    void onFailure(int code, String message) throws RemoteException;
    void onSuccess() throws RemoteException;

    abstract class Stub extends Binder implements IChangeDestinationCallback {
        public static final String DESCRIPTOR = "com.ebanma.map.openapi.basicclass.IChangeDestinationCallback";

        public Stub() { attachInterface(this, DESCRIPTOR); }

        public static IChangeDestinationCallback asInterface(IBinder obj) {
            if (obj == null) return null;
            IInterface iin = obj.queryLocalInterface(DESCRIPTOR);
            if (iin != null && iin instanceof IChangeDestinationCallback) return (IChangeDestinationCallback) iin;
            return new Proxy(obj);
        }

        @Override public IBinder asBinder() { return this; }

        @Override public boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
            switch (code) {
                case 1: data.enforceInterface(DESCRIPTOR);
                    int c = data.readInt();
                    String m = data.readString();
                    onFailure(c, m);
                    reply.writeNoException();
                    return true;
                case 2: data.enforceInterface(DESCRIPTOR);
                    onSuccess();
                    reply.writeNoException();
                    return true;
            }
            return super.onTransact(code, data, reply, flags);
        }

        private static class Proxy implements IChangeDestinationCallback {
            private final IBinder mRemote;
            Proxy(IBinder remote) { mRemote = remote; }
            @Override public IBinder asBinder() { return mRemote; }

            @Override public void onFailure(int code, String message) throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    data.writeInt(code);
                    data.writeString(message);
                    mRemote.transact(1, data, reply, 0);
                    reply.readException();
                } finally { reply.recycle(); data.recycle(); }
            }

            @Override public void onSuccess() throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    mRemote.transact(2, data, reply, 0);
                    reply.readException();
                } finally { reply.recycle(); data.recycle(); }
            }
        }
    }
}
