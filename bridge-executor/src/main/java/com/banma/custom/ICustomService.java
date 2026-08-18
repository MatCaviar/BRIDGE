package com.banma.custom;

import android.os.Binder;
import android.os.IBinder;
import android.os.IInterface;
import android.os.Parcel;
import android.os.RemoteException;

/**
 * CarControlService CustomService contract (reverse-engineered 2026-08-17):
 * transaction codes are by AIDL declaration order: registerCallback=1, unregisterCallback=2,
 * sendMessage=3, isServiceReady=4. Hand-written binder; only sendMessage/isServiceReady implemented.
 */
public interface ICustomService extends IInterface {

    void sendMessage(CustomMessage message, ICustomResponseCallback callback) throws RemoteException;

    boolean isServiceReady() throws RemoteException;

    abstract class Stub extends Binder implements ICustomService {
        public static final String DESCRIPTOR = "com.banma.custom.ICustomService";

        public Stub() { attachInterface(this, DESCRIPTOR); }

        public static ICustomService asInterface(IBinder obj) {
            if (obj == null) return null;
            IInterface iin = obj.queryLocalInterface(DESCRIPTOR);
            if (iin != null && iin instanceof ICustomService) return (ICustomService) iin;
            return new Proxy(obj);
        }

        @Override public IBinder asBinder() { return this; }

        @Override public boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
            switch (code) {
                case 3: data.enforceInterface(DESCRIPTOR);
                    CustomMessage msg = data.readTypedObject(CustomMessage.CREATOR);
                    ICustomResponseCallback cb = ICustomResponseCallback.Stub.asInterface(data.readStrongBinder());
                    sendMessage(msg, cb);
                    reply.writeNoException();
                    return true;
                case 4: data.enforceInterface(DESCRIPTOR);
                    boolean ready = isServiceReady();
                    reply.writeNoException();
                    reply.writeBoolean(ready);
                    return true;
            }
            return super.onTransact(code, data, reply, flags);
        }

        private static class Proxy implements ICustomService {
            private final IBinder mRemote;
            Proxy(IBinder remote) { mRemote = remote; }
            @Override public IBinder asBinder() { return mRemote; }

            @Override public void sendMessage(CustomMessage message, ICustomResponseCallback callback) throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    if (message != null) { data.writeInt(1); message.writeToParcel(data, 0); } else { data.writeInt(0); }
                    data.writeStrongInterface(callback);
                    mRemote.transact(3, data, reply, 0);
                    reply.readException();
                } finally { reply.recycle(); data.recycle(); }
            }

            @Override public boolean isServiceReady() throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    mRemote.transact(4, data, reply, 0);
                    reply.readException();
                    return reply.readBoolean();
                } finally { reply.recycle(); data.recycle(); }
            }
        }
    }
}
