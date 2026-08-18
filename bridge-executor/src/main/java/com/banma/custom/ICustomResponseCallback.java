package com.banma.custom;

import android.os.Binder;
import android.os.IBinder;
import android.os.IInterface;
import android.os.Parcel;
import android.os.RemoteException;

/** ICustomResponseCallback: onResponse(CustomResponse) = 1. */
public interface ICustomResponseCallback extends IInterface {
    void onResponse(CustomResponse response) throws RemoteException;

    abstract class Stub extends Binder implements ICustomResponseCallback {
        public static final String DESCRIPTOR = "com.banma.custom.ICustomResponseCallback";

        public Stub() { attachInterface(this, DESCRIPTOR); }

        public static ICustomResponseCallback asInterface(IBinder obj) {
            if (obj == null) return null;
            IInterface iin = obj.queryLocalInterface(DESCRIPTOR);
            if (iin != null && iin instanceof ICustomResponseCallback) return (ICustomResponseCallback) iin;
            return new Proxy(obj);
        }

        @Override public IBinder asBinder() { return this; }

        @Override public boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
            if (code == 1) {
                data.enforceInterface(DESCRIPTOR);
                CustomResponse resp = data.readTypedObject(CustomResponse.CREATOR);
                onResponse(resp);
                reply.writeNoException();
                return true;
            }
            return super.onTransact(code, data, reply, flags);
        }

        private static class Proxy implements ICustomResponseCallback {
            private final IBinder mRemote;
            Proxy(IBinder remote) { mRemote = remote; }
            @Override public IBinder asBinder() { return mRemote; }

            @Override public void onResponse(CustomResponse response) throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    if (response != null) { data.writeInt(1); response.writeToParcel(data, 0); } else { data.writeInt(0); }
                    mRemote.transact(1, data, reply, 0);
                    reply.readException();
                } finally { reply.recycle(); data.recycle(); }
            }
        }
    }
}
